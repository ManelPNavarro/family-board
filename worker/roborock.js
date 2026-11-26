import { createHash, createHmac, randomBytes } from 'node:crypto';
import { parseRoborockSession } from '../shared/roborock-session.js';
import { readCleaningHistory } from './roborock-history.js';

function parseCleaning(detail) {
  try {
    // The cloud can wrap the same record in two levels of JSON strings.
    let record = detail;
    for (let depth = 0; depth < 2 && typeof record === 'string'; depth++) {
      record = JSON.parse(record);
    }
    const startedAt = record?.record_start_time;
    if (!Number.isSafeInteger(startedAt) || startedAt <= 0 || startedAt > 8_640_000_000_000) return null;
    const area = record.record_clean_area;
    return {
      startedAt: new Date(startedAt * 1000).toISOString(),
      area: Number.isFinite(area) && area >= 0 ? area / 100 : null,
    };
  } catch {
    return null;
  }
}

function readLastCleaning(extra) {
  try {
    const metadata = typeof extra === 'string' ? JSON.parse(extra) : extra;
    return parseCleaning(metadata?.clean_finish);
  } catch {
    return null;
  }
}

const historyFailures = new Set([
  'device_key', 'tls', 'mqtt_login', 'mqtt_subscribe', 'device_reply',
  'device_rejected', 'response_size', 'response_format',
]);

export async function roborockStatus(request, settings, headers) {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
  }
  if (!settings) {
    return Response.json({ error: 'not_configured' }, { status: 503, headers });
  }

  const unavailable = (reason, upstreamStatus) => Response.json(
    { error: 'unavailable', reason, upstreamStatus }, { status: 502, headers },
  );

  let stage = 'configuration';
  try {
    const session = parseRoborockSession(settings);
    const { origin, homeId, deviceId, user, secret, signingKey } = session;
    stage = 'signing';
    const path = `/v3/user/homes/${homeId}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(6).toString('base64url');
    const pathHash = createHash('md5').update(path).digest('hex');
    const mac = createHmac('sha256', signingKey)
      .update(`${user}:${secret}:${nonce}:${timestamp}:${pathHash}::`)
      .digest('base64');
    stage = 'network';
    const result = await fetch(new URL(path, origin), {
      headers: { Authorization: `Hawk id="${user}",s="${secret}",ts="${timestamp}",nonce="${nonce}",mac="${mac}"` },
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
    });
    if (!result.ok) return unavailable('provider_http', result.status);
    stage = 'provider_response';
    const home = await result.json();
    if (home.success !== true) {
      const code = home.code ?? home.errorCode;
      return unavailable('provider_rejected', Number.isSafeInteger(code) ? code : undefined);
    }

    const device = [...(home.result?.devices ?? []), ...(home.result?.receivedDevices ?? [])]
      .find(candidate => candidate.duid === deviceId);
    if (!device) {
      return Response.json({ error: 'device_not_found' }, { status: 404, headers });
    }

    // Use the product schema to interpret the cloud snapshot's numeric field IDs.
    const schema = home.result.products?.find(product => product.id === device.productId)?.schema;
    const batteryField = schema?.find(field => field.code === 'battery' || field.code === 'quantity');
    const stateField = schema?.find(field => field.code === 'state');
    const battery = device.deviceStatus?.[batteryField?.id ?? 122];
    const state = device.deviceStatus?.[stateField?.id ?? 121];

    const snapshot = {
      online: typeof device.online === 'boolean' ? device.online : null,
      battery: Number.isInteger(battery) && battery >= 0 && battery <= 100 ? battery : null,
      stateCode: Number.isSafeInteger(state) ? state : null,
      lastCleaning: readLastCleaning(device.extra),
    };

    if (new URL(request.url).searchParams.get('history') === '1') {
      if (!session.mqttBroker) {
        snapshot.historyError = 'not_configured';
      } else {
        try {
          const records = await readCleaningHistory(session, device.localKey);
          const byStart = new Map();
          for (const item of records) {
            const cleaning = parseCleaning(item?.detail);
            if (cleaning) byStart.set(cleaning.startedAt, cleaning);
          }
          if (records.length && !byStart.size) throw new Error('response_format');
          snapshot.recentCleanings = [...byStart.values()]
            .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
            .slice(0, 3);
        } catch (error) {
          snapshot.historyError = historyFailures.has(error.message) ? error.message : 'unavailable';
        }
      }
    }

    return Response.json(snapshot, { headers });
  } catch {
    return unavailable(stage);
  }
}
