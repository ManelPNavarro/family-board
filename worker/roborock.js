import { createHash, createHmac, randomBytes } from 'node:crypto';
import { parseRoborockSession } from '../shared/roborock-session.js';

export async function roborockStatus(request, settings, headers) {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
  }
  if (!settings) {
    return Response.json({ error: 'not_configured' }, { status: 503, headers });
  }

  try {
    const { origin, homeId, deviceId, user, secret, signingKey } = parseRoborockSession(settings);
    const path = `/v3/user/homes/${homeId}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(6).toString('base64url');
    const pathHash = createHash('md5').update(path).digest('hex');
    const mac = createHmac('sha256', signingKey)
      .update(`${user}:${secret}:${nonce}:${timestamp}:${pathHash}::`)
      .digest('base64');
    const result = await fetch(new URL(path, origin), {
      headers: { Authorization: `Hawk id="${user}",s="${secret}",ts="${timestamp}",nonce="${nonce}",mac="${mac}"` },
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
    if (!result.ok) throw new Error('Roborock request failed');
    const home = await result.json();
    if (home.success !== true) throw new Error('Roborock returned an error');

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

    return Response.json({
      online: typeof device.online === 'boolean' ? device.online : null,
      battery: Number.isInteger(battery) && battery >= 0 && battery <= 100 ? battery : null,
      stateCode: Number.isSafeInteger(state) ? state : null,
    }, { headers });
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 502, headers });
  }
}
