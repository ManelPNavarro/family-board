import assert from 'node:assert/strict';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import worker from './index.js';

test('el Worker exige una sesión de Access válida para el panel y la API', async (t) => {
  const issuer = 'https://family-board-test.cloudflareaccess.com';
  const audience = 'family-board';
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const key = await exportJWK(publicKey);
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(String(url), `${issuer}/cdn-cgi/access/certs`);
    return Response.json({ keys: [{ ...key, kid: 'test-key' }] });
  });
  const assets = t.mock.fn(() => new Response('Panel'));
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
  for (const path of ['/', '/compra/', '/compra.webmanifest', '/assets/app.js', '/api/status', '/api/calendar', '/api/groceries', '/api/groceries/history']) {
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
