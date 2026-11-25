import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';
import { homeLight } from './home-light.js';

test('the home control signs Tuya calls and only accepts the configured light and a same-origin boolean command', async (t) => {
  const origin = 'https://family-board.example';
  const config = JSON.stringify({
    clientId: 'fake-id', clientSecret: 'fake-key', region: 'western-eu', deviceId: 'test-lamp',
  });
  const path = '/v1.0/iot-03/devices/test-lamp';
  const calls = [];
  let lightOn = false;
  let expireToken = false;
  t.mock.method(globalThis, 'fetch', async (url, { method, headers, body, redirect }) => {
    const { origin: endpoint, pathname, search } = new URL(url);
    assert.equal(endpoint, 'https://openapi-weaz.tuyaeu.com');
    assert.equal(redirect, 'manual');
    const route = pathname + search;
    calls.push(route);
    const digest = createHash('sha256').update(body ?? '').digest('hex');
    const signed = [
      headers.client_id + (headers.access_token ?? '') + headers.t + headers.nonce + method,
      digest, '', route,
    ].join('\n');
    assert.equal(headers.sign, createHmac('sha256', 'fake-key').update(signed).digest('hex').toUpperCase());
    if (route === '/v1.0/token?grant_type=1') {
      return Response.json({ success: true, result: { access_token: 'fake-token', expire_time: 7200 } });
    }
    assert.equal(headers.access_token, 'fake-token');
    if (expireToken) {
      expireToken = false;
      return Response.json({ success: false, code: 1010 });
    }
    if (route === path + '/commands') {
      assert.equal(method, 'POST');
      assert.deepEqual(JSON.parse(body), { commands: [{ code: 'switch_led', value: true }] });
      lightOn = true;
      return Response.json({ success: true, result: true });
    }
    assert.equal(route, path + '/status');
    return Response.json({ success: true, result: [{ code: 'switch_led', value: lightOn }] });
  });

  const request = (options) => new Request(origin + '/api/home/light', options);
  const setPower = (body, from = origin) => request({
    method: 'PUT', headers: { Origin: from, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.deepEqual(await (await homeLight(request(), undefined, {})).json(), { configured: false });
  assert.equal((await homeLight(setPower({ on: true }, 'https://other.example'), config, {})).status, 403);
  assert.equal((await homeLight(setPower({ on: 'true' }), config, {})).status, 400);
  assert.equal((await homeLight(setPower({ on: true, deviceId: 'other' }), config, {})).status, 400);
  assert.deepEqual(calls, []);
  assert.deepEqual(await (await homeLight(request(), config, {})).json(), { configured: true, on: false });
  expireToken = true;
  assert.equal((await homeLight(setPower({ on: true }), config, {})).status, 202);
  assert.deepEqual(await (await homeLight(request(), config, {})).json(), { configured: true, on: true });
  assert.deepEqual(calls, [
    '/v1.0/token?grant_type=1', path + '/status', path + '/commands',
    '/v1.0/token?grant_type=1', path + '/commands', path + '/status',
  ]);
});
