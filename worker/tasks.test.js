import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { compareTasks } from '../shared/tasks.js';
import { tasks } from './tasks.js';

test('tasks persist edits and can be completed and reopened', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const migration = await readFile(new URL('../migrations/0004_tasks.sql', import.meta.url), 'utf8');
  db.exec(migration);
  db.exec(migration);
  const d1 = {
    batch: async (statements) => statements.map((statement) => statement.all()),
    prepare(sql) {
      const statement = db.prepare(sql);
      const access = (...params) => ({
        all: () => ({ results: statement.all(...params) }),
        first: () => statement.get(...params) ?? null,
      });
      return { ...access(), bind: access };
    },
  };

  const origin = 'https://family-board.example';
  const id = '12345678-1234-4567-89ab-123456789012';
  const suffix = `/${id}`;
  const send = (method, body, path = '', requestOrigin = origin) => tasks(new Request(
    `${origin}/api/tasks${path}`, {
      method,
      headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  ), d1, { 'Cache-Control': 'private, no-store' });

  const initial = { id, title: ' Regar les plantes ', dueDate: '2028-02-29', priority: 'high' };
  assert.equal((await send('POST', initial, '', 'https://other.example')).status, 403);
  assert.equal((await send('POST', { ...initial, dueDate: '2027-02-29' })).status, 400);
  assert.equal((await send('POST', { ...initial, priority: 'urgent' })).status, 400);
  assert.equal((await send('PATCH', { completed: true }, suffix)).status, 404);
  const create = await send('POST', initial);
  const created = { ...initial, title: 'Regar les plantes', completed: false };
  assert.equal(create.status, 201);
  assert.deepEqual(await create.json(), { task: created });
  assert.equal((await send('PATCH', { completed: 'true' }, suffix)).status, 400);
  assert.equal((await send('PATCH', { completed: true }, suffix, 'https://other.example')).status, 403);
  assert.equal((await send('PATCH', { completed: true }, suffix)).status, 200);
  assert.equal((await send('PATCH', { title: 'Regar els testos', dueDate: null }, suffix)).status, 200);
  assert.equal((await send('POST', initial)).status, 201);
  assert.deepEqual(await (await send('GET')).json(), {
    tasks: [{ ...created, title: 'Regar els testos', dueDate: null, completed: true }],
  });
  assert.equal((await send('PATCH', { completed: false }, suffix)).status, 200);
  assert.equal((await (await send('GET')).json()).tasks[0].completed, false);
  assert.equal(await (await send('HEAD')).text(), '');
});

test('pending tasks sort by urgency, then deadline, with undated tasks last in each priority', () => {
  const high = { priority: 'high', dueDate: null };
  const normalEarly = { priority: 'normal', dueDate: '2027-01-01' };
  const normalLate = { priority: 'normal', dueDate: '2027-01-02' };
  const normalUndated = { priority: 'normal', dueDate: null };
  assert.deepEqual(
    [normalUndated, normalLate, high, normalEarly].sort(compareTasks),
    [high, normalEarly, normalLate, normalUndated],
  );
});
