import assert from 'node:assert/strict';
import test from 'node:test';
import { getWeather } from './weather.js';

test('el temps retorna la previsió local i caduca les dades antigues', async (t) => {
  const location = JSON.stringify({ name: 'Municipi de prova', latitude: 41, longitude: 2 });
  const now = new Date('2026-11-21T09:00:00Z');
  let available = true;
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url.origin, 'https://api.open-meteo.com');
    assert.equal(url.searchParams.get('timezone'), 'Europe/Madrid');
    assert.equal(url.searchParams.get('forecast_days'), '1');
    assert.equal(url.searchParams.get('latitude'), '41');

    if (!available) return new Response(null, { status: 503 });
    return Response.json({
      current: { temperature_2m: 14.1, weather_code: 2, is_day: 1, time: '2026-11-21T10:00' },
      daily: {
        time: ['2026-11-21'],
        temperature_2m_min: [9],
        temperature_2m_max: [15],
        precipitation_probability_max: [0],
        sunrise: ['2026-11-21T07:45'],
        sunset: ['2026-11-21T17:25'],
      },
    });
  });

  const weather = await getWeather(location, now);
  assert.deepEqual(weather, {
    location: 'Municipi de prova', date: '2026-11-21', temperature: 14.1, weatherCode: 2, isDay: true,
    minimum: 9, maximum: 15, precipitation: 0, sunrise: '07:45', sunset: '17:25', measuredAt: '10:00',
  });
  available = false;
  assert.deepEqual(await getWeather(location, new Date('2026-11-21T09:05:00Z')), weather);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.deepEqual(await getWeather(location, new Date('2026-11-21T09:20:00Z')), { ...weather, stale: true });
  await assert.rejects(getWeather(location, new Date('2026-11-21T11:30:00Z')));
  await assert.rejects(getWeather(location, new Date('2026-11-21T23:00:00Z')));
});
