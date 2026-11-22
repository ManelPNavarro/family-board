import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { exerciseTarget, planWorkout } from '../shared/workouts.js';
import { workouts } from './workouts.js';

test('the workout catalog seeds once and the planner respects time, equipment and selected groups', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const migration = await readFile(new URL('../migrations/0010_workouts.sql', import.meta.url), 'utf8');
  db.exec(migration);
  db.exec(migration);
  const url = 'https://family-board.example/api/workouts';
  const d1 = { prepare: (sql) => ({ all: () => ({ results: db.prepare(sql).all() }) }) };
  const { exercises } = await (await workouts(new Request(url), d1, {})).json();
  assert.equal(exercises.length, 6);

  const basic = { movements: ['pull', 'legs'], minutes: 6, energy: 'low', equipment: [] };
  const unavailable = planWorkout(exercises, basic);
  assert.equal(unavailable.rounds, 0);
  assert.deepEqual(unavailable.missing, ['pull', 'legs']);
  const withEquipment = planWorkout(exercises, {
    ...basic, movements: ['core', 'pull', 'legs'], minutes: 2, equipment: ['dumbbell-5'],
  });
  assert.deepEqual(withEquipment.sequence.map(({ id }) => id), ['bird-dog', 'dumbbell-curl']);
  assert.equal(withEquipment.minutes, 2);
  assert.deepEqual(withEquipment.missing, ['legs']);
  const high = planWorkout(exercises, {
    ...basic, movements: ['push', 'pull'], minutes: 15, energy: 'high', equipment: ['pull-up-bar'],
  });
  assert.deepEqual(high.sequence.map(({ id }) => id), ['push-up', 'pull-up', 'slow-push-up', 'chin-up']);
  assert.ok(high.minutes <= 15);
  assert.ok(high.work > withEquipment.work);

  const expansion = await readFile(new URL('../migrations/0011_expand_workout_catalog.sql', import.meta.url), 'utf8');
  db.exec(expansion);
  db.exec(expansion);
  const { exercises: expanded } = await (await workouts(new Request(url), d1, {})).json();
  assert.equal(expanded.length, 15);
  assert.equal(expanded.find(({ id }) => id === 'pull-up').title, 'Pull-ups');
  assert.deepEqual(high.sequence.map(exerciseTarget), ['15 repeticions', '5 repeticions', '15 repeticions', '5 repeticions']);
  assert.deepEqual(withEquipment.sequence.map(exerciseTarget), ['20 repeticions', '15 repeticions']);
  const legs = planWorkout(expanded, { ...basic, movements: ['legs'], equipment: ['dumbbell-12'] });
  assert.deepEqual(legs.sequence.map(({ id }) => id), ['dumbbell-lunge', 'dumbbell-squat', 'glute-bridge']);
  assert.deepEqual(legs.sequence.map(exerciseTarget), ['15 repeticions', '15 repeticions', '15 repeticions']);
  const withoutBench = planWorkout(expanded, { ...basic, movements: ['push'], equipment: [] });
  assert.ok(!withoutBench.sequence.some(({ id }) => id === 'triceps-dip'));
  const withBench = planWorkout(expanded, { ...basic, movements: ['push'], equipment: ['bench'] });
  assert.ok(withBench.sequence.some(({ id }) => id === 'triceps-dip'));

  const planks = await readFile(new URL('../migrations/0012_core_planks.sql', import.meta.url), 'utf8');
  db.exec(planks);
  db.exec(planks);
  const { exercises: fullCatalog } = await (await workouts(new Request(url), d1, {})).json();
  assert.equal(fullCatalog.length, 17);
  const core = planWorkout(fullCatalog, { ...basic, minutes: 12, movements: ['core'] });
  assert.deepEqual(core.sequence.slice(-2).map(({ title }) => title), ['Plank', 'Side Plank']);
  assert.deepEqual(core.sequence.slice(-2).map(exerciseTarget), ['60 segons', '30 segons per costat']);
  assert.equal(core.rounds, 1);
  assert.equal(core.minutes, 7);
});
