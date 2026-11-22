import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { meals } from './meals.js';

test('weekly meals persist and each write replaces only its own slot', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(await readFile(new URL('../migrations/0005_meals.sql', import.meta.url), 'utf8'));
  const d1 = {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind: (...params) => ({
          all: () => ({ results: statement.all(...params) }),
          run: () => statement.run(...params),
        }),
      };
    },
  };
  const origin = 'https://family-board.example';
  const send = (method, suffix = '', data, requestOrigin = origin) => meals(new Request(
    `${origin}/api/meals${suffix}`, {
      method,
      headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    },
  ), d1, { 'Cache-Control': 'private, no-store' });

  const lunch = { date: '2027-01-01', meal: 'lunch', notes: 'Arròs' };
  const dinner = { ...lunch, meal: 'dinner', notes: 'Sopa' };
  const nextWeek = { ...dinner, date: '2027-01-04' };
  assert.equal((await send('PUT', '', lunch, 'https://other.example')).status, 403);
  assert.equal((await send('PUT', '', { ...lunch, date: '2027-02-29' })).status, 400);
  assert.equal((await send('PUT', '', { ...lunch, meal: 'snack' })).status, 400);
  assert.equal((await send('GET', '?week=2026-12-29')).status, 400);

  for (const entry of [lunch, dinner, nextWeek, { ...lunch, notes: '  Llenties  ' }]) {
    assert.equal((await send('PUT', '', entry)).status, 200);
  }
  const week = '?week=2026-12-28';
  const updated = await (await send('GET', week)).json();
  assert.equal(updated.meals.length, 2);
  assert.deepEqual(updated.meals.find(({ meal }) => meal === 'lunch'), { ...lunch, notes: 'Llenties' });
  assert.equal((await send('PUT', '', { ...lunch, notes: ' ' })).status, 200);
  assert.deepEqual(await (await send('GET', week)).json(), { meals: [dinner] });
  assert.deepEqual(await (await send('GET', '?week=2027-01-04')).json(), { meals: [nextWeek] });
});
