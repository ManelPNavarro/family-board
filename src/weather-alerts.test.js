import assert from 'node:assert/strict';
import test from 'node:test';
import { weatherAlerts } from './weather-alerts.js';

const today = '2026-11-21';
const weather = { status: 'ready', date: today, temperature: 18, precipitation: 0 };

test('weather alerts include the thresholds and use one ID per kind and local day', () => {
  const ids = (data, date = today) => weatherAlerts({ ...weather, ...data }, date).map(({ id }) => id);

  assert.deepEqual(ids({ temperature: 12, precipitation: 70 }), [`weather:cold:${today}`, `weather:rain:${today}`]);
  assert.deepEqual(ids({ temperature: 30 }), [`weather:heat:${today}`]);
  assert.deepEqual(ids({ temperature: 12.1, precipitation: 69 }), []);
  assert.deepEqual(ids({ temperature: 29.9 }), []);
  assert.deepEqual(ids({ temperature: 8 }), [`weather:cold:${today}`]);
  assert.deepEqual(ids({ temperature: 8, date: '2026-11-22' }, '2026-11-22'), ['weather:cold:2026-11-22']);
});

test('weather alerts ignore stale or missing readings', () => {
  assert.deepEqual(weatherAlerts({ ...weather, temperature: 8, precipitation: 80, stale: true }, today), []);
  assert.deepEqual(weatherAlerts({ ...weather, temperature: 8, date: '2026-11-20' }, today), []);
  assert.deepEqual(weatherAlerts({ status: 'unavailable' }, today), []);
  assert.deepEqual(weatherAlerts({ ...weather, temperature: null, precipitation: null }, today), []);
});
