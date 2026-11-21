const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
const rawCredentials = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT;

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

process.stdout.write(JSON.stringify({
  GOOGLE_CALENDAR_ID: calendarId,
  GOOGLE_CALENDAR_SERVICE_ACCOUNT: JSON.stringify({ client_email, private_key, private_key_id }),
}));
