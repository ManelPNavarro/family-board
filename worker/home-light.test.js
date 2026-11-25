import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';
import { homeLight } from './home-light.js';
import { lightScenes } from './light-scenes.js';

const capabilities = [
  { code: 'work_mode', type: 'Enum', values: '{"range":["white","colour"]}' },
  { code: 'bright_value_v2', type: 'Integer', values: '{"min":10,"max":1000,"step":10}' },
  { code: 'temp_value_v2', type: 'Integer', values: '{"min":0,"max":1000,"step":1}' },
  { code: 'colour_data_v2', type: 'Json', values: '{}' },
];

test('the home control signs Tuya calls and only accepts the configured light and a same-origin boolean command', async (t) => {
  const origin = 'https://family-board.example';
  const config = JSON.stringify({
    clientId: 'fake-id', clientSecret: 'fake-key', region: 'western-eu', deviceId: 'test-lamp',
  });
  const path = '/v1.0/iot-03/devices/test-lamp';
  const calls = [];
  const commandBatches = [];
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
      const { commands } = JSON.parse(body);
      commandBatches.push(commands);
      if (commands.length > 1) return Response.json({ success: true, result: false });
      if (commands[0].code === 'switch_led') lightOn = commands[0].value;
      return Response.json({ success: true, result: true });
    }
    if (route === path + '/functions') {
      return Response.json({ success: true, result: { functions: capabilities } });
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
  const sceneEndpoint = origin + '/api/home/light/scenes';
  const list = await homeLight(new Request(sceneEndpoint), config, {});
  assert.deepEqual((await list.json()).scenes.map(({ title, commands }) => [title, commands]), [
    ['Vespre', undefined], ['Llegir', undefined], ['Peli', undefined], ['Cita', undefined],
  ]);
  const applyScene = (scene, from = origin) => new Request(sceneEndpoint, {
    method: 'PUT', headers: { Origin: from, 'Content-Type': 'application/json' }, body: JSON.stringify({ scene }),
  });
  assert.equal((await homeLight(applyScene('cita', 'https://other.example'), config, {})).status, 403);
  assert.equal((await homeLight(applyScene('custom'), config, {})).status, 422);
  assert.equal((await homeLight(applyScene('cita'), config, {})).status, 202);
  assert.deepEqual(commandBatches, [
    [{ code: 'switch_led', value: true }],
    [{ code: 'switch_led', value: true }],
    [{ code: 'work_mode', value: 'colour' }],
    [{ code: 'colour_data_v2', value: { h: 38, s: 800, v: 200 } }],
  ]);
});

test('warm white fallback uses the supported range, including legacy dimmers', () => {
  assert.deepEqual(lightScenes([{ code: 'switch_led', type: 'Boolean' }], 'switch_led'), []);
  const scenes = lightScenes([
    { code: 'bright_value', type: 'Integer', values: '{"min":25,"max":255,"step":5}' },
    { code: 'temp_value', type: 'Integer', values: '{"min":0,"max":255}' },
  ], 'switch_led');
  assert.deepEqual(scenes.find(({ id }) => id === 'cita').commands, [
    { code: 'switch_led', value: true },
    { code: 'temp_value', value: 0 },
    { code: 'bright_value', value: 50 },
  ]);
  assert.equal(scenes.find(({ id }) => id === 'peli').commands.at(-1).value, 25);
});
