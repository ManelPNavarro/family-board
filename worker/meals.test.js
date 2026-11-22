import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { meals } from './meals.js';

test('weekly meals persist and each write replaces only its own slot', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(await readFile(new URL('../migrations/0005_meals.sql', import.meta.url), 'utf8'));
  db.exec(await readFile(new URL('../migrations/0006_school_meals.sql', import.meta.url), 'utf8'));
  db.exec(await readFile(new URL('../migrations/0007_meal_courses.sql', import.meta.url), 'utf8'));
  const d1 = {
    batch: async (statements) => statements.map((statement) => statement.all()),
    prepare(sql) {
      const statement = db.prepare(sql);
      const bind = (...params) => ({
        all: () => ({ results: statement.all(...params) }),
        run: () => statement.run(...params),
      });
      return { ...bind(), bind };
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
  assert.deepEqual(updated.meals.find(({ meal }) => meal === 'lunch'), { ...lunch, notes: 'Llenties', school: false });
  db.prepare('INSERT INTO meal_settings (key, value) VALUES (?, ?)').run('school_label', 'Escola de prova');
  const school = { ...lunch, notes: 'Llenties', school: true };
  assert.equal((await send('PUT', '', { ...school, school: 'true' })).status, 400);
  assert.deepEqual(await (await send('PUT', '', school)).json(), school);
  const withSchool = await (await send('GET', week)).json();
  assert.equal(withSchool.schoolLabel, 'Escola de prova');
  assert.deepEqual(withSchool.meals.find(({ meal }) => meal === 'lunch'), school);
  assert.equal((await send('PUT', '', { ...school, school: false })).status, 200);
  assert.deepEqual((await (await send('GET', week)).json()).meals.find(({ meal }) => meal === 'lunch'),
    { ...school, school: false });
  assert.equal((await send('PUT', '', { ...lunch, notes: ' ' })).status, 200);
  assert.deepEqual((await (await send('GET', week)).json()).meals, [{ ...dinner, school: false }]);
  assert.deepEqual((await (await send('GET', '?week=2027-01-04')).json()).meals, [{ ...nextWeek, school: false }]);

  const courses = { date: lunch.date, meal: lunch.meal, courses: [' Arròs ', 'Truita', 'Pera'], school: false };
  assert.equal((await send('PUT', '', { ...courses, courses: ['Arròs'] })).status, 400);
  const saved = await (await send('PUT', '', courses)).json();
  assert.deepEqual(saved.courses, ['Arròs', 'Truita', 'Pera']);
  const planned = await (await send('GET', week)).json();
  assert.deepEqual(planned.meals.find(({ meal }) => meal === 'lunch'), saved);
  assert.deepEqual(planned.courseHistory, [['Arròs'], ['Truita'], ['Pera']]);
  assert.equal((await send('PUT', '', { ...courses, school: true })).status, 200);
  assert.equal((await (await send('GET', week)).json()).meals.find(({ meal }) => meal === 'lunch').school, true);
  assert.equal((await send('PUT', '', { ...courses, courses: ['', 'Truita', ''] })).status, 200);
  const replaced = await (await send('GET', week)).json();
  assert.deepEqual(replaced.meals.find(({ meal }) => meal === 'lunch').courses, ['', 'Truita', '']);
  assert.deepEqual(replaced.courseHistory, [['Arròs'], ['Truita'], ['Pera']]);
});
