import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';
import { roborockStatus } from './roborock.js';

const url = 'https://family-board.example/api/home/roborock';
const headers = { 'Cache-Control': 'private, no-store' };
const session = JSON.stringify({
  origin: 'https://api-eu.roborock.com', homeId: '123', deviceId: 'vacuum',
  user: 'sample-user', secret: 'sample-secret', signingKey: 'sample-key',
});

test('Roborock probe signs a read and returns only the configured vacuum status', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (target, options) => {
    const path = '/v3/user/homes/123';
    assert.equal(target.href, `https://api-eu.roborock.com${path}`);
    assert.equal(options.redirect, 'manual');
    const auth = Object.fromEntries([...options.headers.Authorization.matchAll(/(\w+)="([^"]+)"/g)]
      .map(([, field, value]) => [field, value]));
    const hash = createHash('md5').update(path).digest('hex');
    const expected = createHmac('sha256', 'sample-key')
      .update(`sample-user:sample-secret:${auth.nonce}:${auth.ts}:${hash}::`)
      .digest('base64');
    assert.equal(auth.mac, expected);
    return Response.json({
      success: true,
      result: {
        devices: [{ duid: 'other', online: false }],
        receivedDevices: [{
          duid: 'vacuum', productId: 'model', online: true,
          extra: JSON.stringify({ clean_finish: JSON.stringify(JSON.stringify({
            record_start_time: 1795705200, record_clean_area: 3870, record_map_url: 'ignored',
          })) }),
          localKey: 'ignored', deviceStatus: { 220: 96, 221: 8 },
        }],
        products: [{ id: 'model', schema: [{ code: 'battery', id: 220 }, { code: 'state', id: 221 }] }],
      },
    });
  });

  const response = await roborockStatus(new Request(url), session, headers);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(await response.json(), {
    canStartCleaning: false, online: true, battery: 96, stateCode: 8,
    lastCleaning: { startedAt: new Date(1795705200 * 1000).toISOString(), area: 38.7 },
  });
});

test('Roborock probe rejects writes and keeps invalid configuration off the network', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected cloud request'));
  assert.equal((await roborockStatus(new Request(url, { method: 'POST' }), session, headers)).status, 405);
  assert.equal((await roborockStatus(new Request(url), undefined, headers)).status, 503);
  const invalidSession = session.replace('api-eu.roborock.com', 'api-eu.roborock.com.example');
  const response = await roborockStatus(new Request(url), invalidSession, headers);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'unavailable', reason: 'configuration' });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('starting the Roborock requires POST from the app and refuses an active robot', async (t) => {
  const mqttSession = JSON.stringify({
    ...JSON.parse(session), mqttBroker: 'ssl://mqtt-eu.roborock.com:8883', mqttKey: 'sample-mqtt-key',
  });
  const endpoint = `${url}/clean`;
  const origin = new URL(url).origin;
  const start = (headers = {}) => new Request(endpoint, { method: 'POST', headers });
  const fakeFetch = t.mock.method(globalThis, 'fetch', async () => Response.json({
    success: true,
    result: { devices: [{ duid: 'vacuum', online: true, deviceStatus: { 121: 5, 122: 96 } }] },
  }));

  assert.equal((await roborockStatus(new Request(endpoint), mqttSession, headers)).status, 405);
  assert.equal((await roborockStatus(start({ Origin: 'https://other.example' }), mqttSession, headers)).status, 403);
  assert.equal((await roborockStatus(start({ Origin: origin }), session, headers)).status, 503);
  assert.equal(fakeFetch.mock.callCount(), 0);
  assert.equal((await roborockStatus(start({ Origin: origin }), mqttSession, headers)).status, 409);
  assert.equal(fakeFetch.mock.callCount(), 1);
});
