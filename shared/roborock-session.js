export function parseRoborockSession(raw) {
  const { origin, homeId, deviceId, user, secret, signingKey } = JSON.parse(raw);
  const endpoint = new URL(origin);
  if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.origin !== origin ||
      !/^([a-z0-9-]+\.)+(roborock\.com|rr\.miio\.com)$/.test(endpoint.hostname) ||
      !/^\d+$/.test(homeId) || typeof homeId !== 'string' ||
      ![deviceId, user, secret, signingKey].every(value =>
        typeof value === 'string' && /^[\x21\x23-\x5b\x5d-\x7e]{1,256}$/.test(value))) {
    throw new Error('Invalid Roborock session');
  }
  return { origin, homeId, deviceId, user, secret, signingKey };
}
