import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { groceries } from './groceries.js';

test('la llista compartida conserva les edicions i rebutja les escriptures d’altres orígens', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../migrations/0001_groceries.sql', import.meta.url), 'utf8'));
  const d1 = {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        all: async () => ({ results: statement.all() }),
        bind: (...params) => ({
          run: async () => statement.run(...params),
          first: async () => statement.get(...params) ?? null,
        }),
      };
    },
  };
  const origin = 'https://family-board.example';
  const id = '12345678-1234-4567-89ab-123456789012';
  function send(method, suffix = '', data, requestOrigin = origin) {
    return groceries(new Request(`${origin}/api/groceries${suffix}`, {
      method,
      headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    }), d1, { 'Cache-Control': 'private, no-store' });
  }

  assert.equal((await send('POST', '', { id, title: 'Llet' }, 'https://other.example')).status, 403);
  assert.equal((await send('POST', '', { id, title: '  ' })).status, 400);
  assert.deepEqual(await (await send('GET')).json(), { items: [] });

  const created = await send('POST', '', { id, title: ' Llet ' });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { item: { id, title: 'Llet', checked: false } });

  assert.equal((await send('PATCH', `/${id}`, { checked: 'true' })).status, 400);
  assert.equal((await send('PATCH', `/${id}`, { checked: true })).status, 200);
  assert.equal((await send('PATCH', `/${id}`, { title: 'Llet sencera' })).status, 200);
  assert.equal((await send('POST', '', { id, title: ' Llet ' })).status, 201);
  assert.deepEqual(await (await send('GET')).json(), {
    items: [{ id, title: 'Llet sencera', checked: true }],
  });

  assert.equal((await send('DELETE', `/${id}`)).status, 204);
  assert.equal((await send('DELETE', `/${id}`)).status, 204);
  assert.equal((await send('PATCH', `/${id}`, { checked: false })).status, 404);
  assert.deepEqual(await (await send('GET')).json(), { items: [] });
  db.close();
});
