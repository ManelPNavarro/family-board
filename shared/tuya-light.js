const endpoints = {
  'central-eu': 'https://openapi.tuyaeu.com',
  'western-eu': 'https://openapi-weaz.tuyaeu.com',
};

export function parseTuyaLight(raw) {
  const { region, clientId, clientSecret, deviceId, switchCode = 'switch_led' } = JSON.parse(raw);
  if (!Object.hasOwn(endpoints, region) ||
      ![clientId, clientSecret].every((value) => typeof value === 'string' && /^[\x21-\x7e]{1,256}$/.test(value)) ||
      typeof deviceId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(deviceId) ||
      typeof switchCode !== 'string' || !/^[a-zA-Z0-9_]{1,64}$/.test(switchCode)) {
    throw new Error('Invalid Tuya light configuration.');
  }
  return { region, clientId, clientSecret, deviceId, switchCode, endpoint: endpoints[region] };
}
