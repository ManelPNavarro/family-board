import { dayKey, timeZone } from '../shared/dates.js';
import { parseWeatherLocation } from '../shared/weather-location.js';

const freshness = 15 * 60_000;
const staleLimit = 2 * 60 * 60_000;
let snapshot;

export async function getWeather(rawLocation, now = new Date()) {
  const date = dayKey(now);
  const last = snapshot?.location === rawLocation && snapshot.data.date === date ? snapshot : null;
  if (last && now.getTime() - last.fetchedAt < freshness) return last.data;

  const { name, latitude, longitude } = parseWeatherLocation(rawLocation);
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: timeZone,
    forecast_days: '1',
    current: 'temperature_2m,weather_code,is_day',
    daily: 'temperature_2m_min,temperature_2m_max,precipitation_probability_max,sunrise,sunset',
  });

  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(7_000) });
    if (!response.ok) throw new Error('Weather provider unavailable');

    const { current, daily } = await response.json();
    if (daily?.time?.[0] !== date || !Number.isFinite(current?.temperature_2m) ||
        !current?.time?.startsWith(`${date}T`)) throw new Error('Weather data missing for today');

    const data = {
      location: name,
      date,
      temperature: current.temperature_2m,
      weatherCode: current.weather_code ?? null,
      isDay: current.is_day === 1,
      minimum: daily.temperature_2m_min?.[0] ?? null,
      maximum: daily.temperature_2m_max?.[0] ?? null,
      precipitation: daily.precipitation_probability_max?.[0] ?? null,
      sunrise: daily.sunrise?.[0]?.slice(11, 16) || null,
      sunset: daily.sunset?.[0]?.slice(11, 16) || null,
      measuredAt: current.time.slice(11, 16),
    };
    snapshot = { location: rawLocation, data, fetchedAt: now.getTime() };
    return data;
  } catch (error) {
    if (last && now.getTime() - last.fetchedAt < staleLimit) {
      return { ...last.data, stale: true };
    }
    throw error;
  }
}
