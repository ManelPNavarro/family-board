import { parseWeatherLocation } from '../shared/weather-location.js';

const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
const rawCredentials = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT;
const weatherLocation = process.env.WEATHER_LOCATION;
const secrets = {};

if (calendarId || rawCredentials) {
  if (!calendarId || !rawCredentials) {
    throw new Error('Configura los dos secretos de Google Calendar en GitHub Actions.');
  }

  let credentials;
  try {
    credentials = JSON.parse(rawCredentials);
  } catch {
    throw new Error('GOOGLE_CALENDAR_SERVICE_ACCOUNT debe ser una clave JSON de Google.');
  }

  const { type, client_email, private_key, private_key_id } = credentials ?? {};
  if (type !== 'service_account' || !client_email || !private_key?.startsWith('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('La clave JSON tiene que corresponder a una cuenta de servicio de Google.');
  }

  secrets.GOOGLE_CALENDAR_ID = calendarId;
  secrets.GOOGLE_CALENDAR_SERVICE_ACCOUNT = JSON.stringify({ client_email, private_key, private_key_id });
}

if (weatherLocation) {
  try {
    secrets.WEATHER_LOCATION = JSON.stringify(parseWeatherLocation(weatherLocation));
  } catch {
    throw new Error('WEATHER_LOCATION necessita un JSON amb name, latitude i longitude vàlids.');
  }
}

process.stdout.write(JSON.stringify(secrets));
