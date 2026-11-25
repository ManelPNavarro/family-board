import { parseTuyaLight } from '../shared/tuya-light.js';

const encoder = new TextEncoder();
let cachedToken;

function hex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function requestTuya(config, path, { method = 'GET', body, token } = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const digest = hex(await crypto.subtle.digest('SHA-256', encoder.encode(payload)));
  const time = String(Date.now());
  const nonce = crypto.randomUUID();
  const signingKey = await crypto.subtle.importKey(
    'raw', encoder.encode(config.clientSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signed = `${config.clientId}${token ?? ''}${time}${nonce}${method}\n${digest}\n\n${path}`;
  const signature = hex(await crypto.subtle.sign('HMAC', signingKey, encoder.encode(signed))).toUpperCase();
  const response = await fetch(config.endpoint + path, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers: {
      client_id: config.clientId,
      sign: signature,
      sign_method: 'HMAC-SHA256',
      t: time,
      nonce,
      ...(token && { access_token: token }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : payload,
  });
  const data = await response.json();
  if (!response.ok || data?.success !== true) {
    throw Object.assign(new Error('Tuya request failed.'), { code: Number(data?.code) });
  }
  return data.result;
}

async function getToken(config, rawConfig) {
  if (cachedToken?.config === rawConfig && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const result = await requestTuya(config, '/v1.0/token?grant_type=1');
  if (typeof result?.access_token !== 'string' || !result.access_token) throw new Error('Missing Tuya token.');
  cachedToken = {
    config: rawConfig,
    value: result.access_token,
    expiresAt: Date.now() + (Number(result.expire_time) - 60) * 1000,
  };
  return cachedToken.value;
}

async function deviceRequest(config, rawConfig, action, options) {
  const path = `/v1.0/iot-03/devices/${config.deviceId}/${action}`;
  const token = await getToken(config, rawConfig);
  try {
    return await requestTuya(config, path, { ...options, token });
  } catch (error) {
    if (![1010, 1011, 1012].includes(error.code)) throw error;
    if (cachedToken?.config === rawConfig && cachedToken.value === token) cachedToken = undefined;
    return requestTuya(config, path, { ...options, token: await getToken(config, rawConfig) });
  }
}

export async function homeLight(request, rawConfig, headers) {
  const result = (body, status = 200) => Response.json(body, { status, headers });
  const { method } = request;
  if (method !== 'GET' && method !== 'PUT') {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, PUT' } });
  }
  if (method === 'PUT' && request.headers.get('Origin') !== new URL(request.url).origin) {
    return result({ error: 'forbidden' }, 403);
  }
  if (!rawConfig) return method === 'GET' ? result({ configured: false }) : result({ error: 'not_configured' }, 503);

  try {
    const config = parseTuyaLight(rawConfig);
    if (method === 'PUT') {
      if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
        return result({ error: 'invalid_light_state' }, 415);
      }
      const body = await request.json().catch(() => null);
      if (typeof body?.on !== 'boolean' || Object.keys(body).length !== 1) {
        return result({ error: 'invalid_light_state' }, 400);
      }
      const accepted = await deviceRequest(config, rawConfig, 'commands', {
        method: 'POST',
        body: { commands: [{ code: config.switchCode, value: body.on }] },
      });
      return accepted === true ? result({ accepted: true }, 202) : result({ error: 'unavailable' }, 502);
    }

    const status = await deviceRequest(config, rawConfig, 'status');
    const on = Array.isArray(status) ? status.find((entry) => entry?.code === config.switchCode)?.value : null;
    return typeof on === 'boolean' ? result({ configured: true, on }) : result({ error: 'unavailable' }, 502);
  } catch {
    return result({ error: 'unavailable' }, 502);
  }
}
