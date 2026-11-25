import { parseWeatherLocation } from '../shared/weather-location.js';
import { parseTuyaLight } from '../shared/tuya-light.js';

const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
const rawCredentials = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT;
const weatherLocation = process.env.WEATHER_LOCATION;
const secrets = {};

if (calendarId || rawCredentials) {
  if (!calendarId || !rawCredentials) {
    throw new Error('Set both Google Calendar secrets in GitHub Actions.');
  }

  let credentials;
  try {
    credentials = JSON.parse(rawCredentials);
  } catch {
    throw new Error('GOOGLE_CALENDAR_SERVICE_ACCOUNT must be a Google JSON key.');
  }

  const { type, client_email, private_key, private_key_id } = credentials ?? {};
  if (type !== 'service_account' || !client_email || !private_key?.startsWith('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('The JSON key must belong to a Google service account.');
  }

  secrets.GOOGLE_CALENDAR_ID = calendarId;
  secrets.GOOGLE_CALENDAR_SERVICE_ACCOUNT = JSON.stringify({ client_email, private_key, private_key_id });
}

if (weatherLocation) {
  try {
    secrets.WEATHER_LOCATION = JSON.stringify(parseWeatherLocation(weatherLocation));
  } catch {
    throw new Error('WEATHER_LOCATION must be a JSON object with valid name, latitude, and longitude fields.');
  }
}

if (process.env.TUYA_LIGHT) {
  try {
    const { endpoint, ...settings } = parseTuyaLight(process.env.TUYA_LIGHT);
    secrets.TUYA_LIGHT = JSON.stringify(settings);
  } catch {
    throw new Error('TUYA_LIGHT must contain a valid Tuya light configuration.');
  }
}

process.stdout.write(JSON.stringify(secrets));
