import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { dayKey, shiftDate } from '../shared/dates.js';
import { compareTasks, nextTaskDate, taskDates, taskPeriods } from '../shared/tasks.js';
import { tasks } from './tasks.js';

test('tasks persist edits and can be completed, reopened and deleted', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const migration = await readFile(new URL('../migrations/0004_tasks.sql', import.meta.url), 'utf8');
  db.exec(migration);
  const legacyId = '12345678-1234-4567-89ab-123456789011';
  db.prepare("INSERT INTO tasks (id, title, priority) VALUES (?, 'Existing task', 'normal')").run(legacyId);
  db.exec(await readFile(new URL('../migrations/0013_task_recurrence_and_assignee.sql', import.meta.url), 'utf8'));
  const d1 = {
    batch: async (statements) => statements.map((statement) => statement.all()),
    prepare(sql) {
      const statement = db.prepare(sql);
      const access = (...params) => ({
        all: () => ({ results: statement.all(...params) }),
        first: () => statement.get(...params) ?? null,
        run: () => statement.run(...params),
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
      headers: { Origin: requestOrigin, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  ), d1, { 'Cache-Control': 'private, no-store' });

  assert.deepEqual((await (await send('GET')).json()).tasks[0], {
    id: legacyId, title: 'Existing task', priority: 'normal', dueDate: null, completed: false,
    recurrence: 'none', assignee: null,
  });
  await send('DELETE', undefined, `/${legacyId}`);

  const initial = { id, title: ' Regar les plantes ', dueDate: '2028-02-29', priority: 'high' };
  assert.equal((await send('POST', initial, '', 'https://other.example')).status, 403);
  assert.equal((await send('POST', { ...initial, dueDate: '2027-02-29' })).status, 400);
  assert.equal((await send('POST', { ...initial, priority: 'urgent' })).status, 400);
  assert.equal((await send('PATCH', { completed: true }, suffix)).status, 404);
  const create = await send('POST', initial);
  const created = { ...initial, title: 'Regar les plantes', completed: false, recurrence: 'none', assignee: null };
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
  assert.equal((await send('DELETE', undefined, suffix, 'https://other.example')).status, 403);
  assert.equal((await send('DELETE')).status, 405);
  assert.equal((await send('DELETE', undefined, '/bad-id')).status, 404);
  assert.equal((await (await send('GET')).json()).tasks.length, 1);
  const deleted = await send('DELETE', undefined, suffix);
  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), '');
  assert.deepEqual(await (await send('GET')).json(), { tasks: [] });
  assert.equal((await send('DELETE', undefined, suffix)).status, 204);

  const due = shiftDate(dayKey(new Date()), 1);
  const recurring = { ...initial, dueDate: due, recurrence: 'weekly', assignee: 'marina' };
  assert.equal((await send('POST', { ...recurring, dueDate: null })).status, 400);
  assert.equal((await send('POST', { ...recurring, assignee: 'someone' })).status, 400);
  assert.equal((await send('POST', recurring)).status, 201);
  assert.equal((await send('PATCH', { dueDate: null }, suffix)).status, 400);
  assert.equal((await send('PATCH', { assignee: 'manel' }, suffix)).status, 200);
  const completions = await Promise.all([
    send('PATCH', { completed: true }, suffix),
    send('PATCH', { completed: true }, suffix),
  ]);
  const histories = await Promise.all(completions.map(response => response.json()));
  const next = histories.find(({ nextTask }) => nextTask)?.nextTask;
  assert.ok(next);
  assert.equal(next.assignee, 'manel');
  assert.equal(next.dueDate, shiftDate(due, 7));
  assert.equal(next.recurrence, 'weekly');
  assert.equal(next.completed, false);
  assert.equal((await (await send('GET')).json()).tasks.length, 2);
  assert.equal((await (await send('PATCH', { completed: true }, suffix)).json()).nextTask, undefined);
  const reopened = (await (await send('PATCH', { completed: false }, suffix)).json()).task;
  assert.equal(reopened.recurrence, 'none');
  assert.equal((await (await send('PATCH', { assignee: null }, `/${next.id}`)).json()).task.assignee, null);
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

test('date shortcuts use the Madrid day and end the current week on Sunday', () => {
  const monday = dayKey(new Date('2026-10-25T23:30:00Z'));
  assert.deepEqual(taskDates(monday), {
    tomorrow: '2026-10-27', weekStart: '2026-10-26', weekEnd: '2026-11-01',
  });
  assert.deepEqual(taskDates('2026-11-01'), {
    tomorrow: '2026-11-02', weekStart: '2026-10-26', weekEnd: '2026-11-01',
  });
  assert.equal(taskDates('2026-12-31').tomorrow, '2027-01-01');
});

test('dashboard task periods include only unfinished tasks due in the selected period', () => {
  const task = (dueDate, priority = 'normal', completed = false) => ({ dueDate, priority, completed });
  const today = '2026-11-21';
  const sameDay = task(today);
  const monday = task('2026-11-16');
  const sunday = task('2026-11-22', 'high');
  assert.deepEqual(taskPeriods([
    sameDay, monday, sunday, task(null), task(today, 'high', true),
    task('2026-11-15'), task('2026-11-23'),
  ], today), { today: [sameDay], week: [sunday, monday, sameDay] });
});

test('recurrence keeps the original monthly day and skips missed occurrences', () => {
  assert.equal(nextTaskDate('2027-01-31', 'monthly', 31, '2027-01-31'), '2027-02-28');
  assert.equal(nextTaskDate('2027-02-28', 'monthly', 31, '2027-02-28'), '2027-03-31');
  assert.equal(nextTaskDate('2027-02-28', 'monthly', 31, '2027-04-30'), '2027-05-31');
  assert.equal(nextTaskDate('2027-01-03', 'weekly', null, '2027-01-20'), '2027-01-24');
  assert.equal(nextTaskDate('2027-01-03', 'fortnightly', null, '2027-01-17'), '2027-01-31');
  assert.equal(nextTaskDate('2027-01-03', 'daily', null, '2027-01-20'), '2027-01-21');
  assert.equal(nextTaskDate('9999-12-31', 'monthly', 31, '2027-01-20'), null);
  assert.equal(nextTaskDate(null, 'none', null, '2027-01-20'), null);
});
