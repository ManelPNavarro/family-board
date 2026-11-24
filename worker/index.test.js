import assert from 'node:assert/strict';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import worker from './index.js';

test('the Worker requires a valid Access session for the dashboard and API', async (t) => {
  const issuer = 'https://family-board-test.cloudflareaccess.com';
  const audience = 'family-board';
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const key = await exportJWK(publicKey);
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(String(url), `${issuer}/cdn-cgi/access/certs`);
    return Response.json({ keys: [{ ...key, kid: 'test-key' }] });
  });
  const assets = t.mock.fn((request) => request.headers.get('If-None-Match') === '"test-tag"'
    ? new Response(null, { status: 304, headers: { ETag: '"test-tag"' } })
    : new Response('Panel', { headers: { ETag: '"test-tag"' } }));
  const prepare = t.mock.fn(() => ({ first: async () => 1 }));
  const env = {
    ACCESS_ISSUER: issuer,
    ACCESS_AUD: audience,
    COMMIT_SHA: 'abc123456789',
    ASSETS: { fetch: assets },
    DB: { prepare },
  };

  function request(path, token) {
    return new Request(`https://family-board.example${path}`, {
      headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {},
    });
  }

  function sign(aud, expiration = '5m') {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience(aud)
      .setSubject('family-member')
      .setExpirationTime(expiration)
      .sign(privateKey);
  }

  const valid = await sign(audience);
  const wrongAudience = await sign('another-app');
  const expired = await sign(audience, 1);
  const bundle = '/assets/main-Abc123_4.js';
  for (const path of ['/', '/compra/', '/compra.webmanifest', '/family-board.webmanifest', bundle, '/api/status', '/api/weather', '/api/calendar', '/api/groceries', '/api/groceries/history', '/api/tasks']) {
    for (const token of [undefined, 'fake-token', wrongAudience, expired]) {
      const response = await worker.fetch(request(path, token), env);
      assert.equal(response.status, 403);
    }
  }
  assert.equal((await worker.fetch(request('/', valid), {})).status, 403);
  assert.equal(assets.mock.callCount(), 0);
  assert.equal(prepare.mock.callCount(), 0);

  const panel = await worker.fetch(request('/', valid), env);
  assert.equal(await panel.text(), 'Panel');
  assert.equal(panel.headers.get('Cache-Control'), 'private, no-store');

  const asset = await worker.fetch(request(bundle, valid), env);
  assert.equal(asset.headers.get('Cache-Control'), 'private, no-cache');
  const conditional = request(bundle, valid);
  conditional.headers.set('If-None-Match', asset.headers.get('ETag'));
  const unchanged = await worker.fetch(conditional, env);
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get('Cache-Control'), 'private, no-cache');
  conditional.headers.delete('Cf-Access-Jwt-Assertion');
  assert.equal((await worker.fetch(conditional, env)).status, 403);

  const calendar = await worker.fetch(request('/api/calendar', valid), env);
  assert.equal(calendar.status, 503);
  assert.deepEqual(await calendar.json(), { error: 'not_configured' });
  assert.equal(calendar.headers.get('Cache-Control'), 'private, no-store');

  const status = await worker.fetch(request('/api/status', valid), env);
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { commit: 'abc123456789', database: 'ready' });

  const unavailable = await worker.fetch(request('/api/status', valid), { ...env, DB: undefined });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    commit: 'abc123456789',
    database: 'unavailable',
  });
});
