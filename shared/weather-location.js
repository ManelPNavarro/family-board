export function parseWeatherLocation(raw) {
  const { name, latitude, longitude } = JSON.parse(raw) ?? {};
  if (typeof name !== 'string' || !name.trim() || name.length > 100 ||
      !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new Error('WEATHER_LOCATION requires a valid name, latitude, and longitude.');
  }
  return { name: name.trim(), latitude, longitude };
}
