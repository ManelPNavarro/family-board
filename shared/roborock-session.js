const providerHost = /^([a-z0-9-]+\.)+(roborock\.com|rr\.miio\.com)$/;
const credential = /^[\x21\x23-\x5b\x5d-\x7e]{1,256}$/;

export function parseRoborockSession(raw) {
  const { origin, homeId, deviceId, user, secret, signingKey, mqttBroker, mqttKey } = JSON.parse(raw);
  const endpoint = new URL(origin);
  if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.origin !== origin ||
      !providerHost.test(endpoint.hostname) ||
      typeof homeId !== 'string' || !/^\d+$/.test(homeId) ||
      ![deviceId, user, secret, signingKey].every(value => typeof value === 'string' && credential.test(value))) {
    throw new Error('Invalid Roborock session');
  }

  const session = { origin, homeId, deviceId, user, secret, signingKey };
  if (mqttBroker !== undefined || mqttKey !== undefined) {
    const broker = new URL(mqttBroker);
    if (!['ssl:', 'tcp:', 'mqtts:'].includes(broker.protocol) || broker.port !== '8883' ||
        !providerHost.test(broker.hostname) || broker.username || broker.password ||
        (broker.pathname && broker.pathname !== '/') || broker.search || broker.hash ||
        ![deviceId, user].every(value => !/[/+#]/.test(value)) ||
        typeof mqttKey !== 'string' || !credential.test(mqttKey)) {
      throw new Error('Invalid Roborock MQTT session');
    }
    Object.assign(session, { mqttBroker, mqttKey });
  }
  return session;
}
