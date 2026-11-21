import { importPKCS8, SignJWT } from 'jose';
import { calendarDays, timeZone } from '../shared/dates.js';

const tokenUrl = 'https://oauth2.googleapis.com/token';
const calendarScope = 'https://www.googleapis.com/auth/calendar.events.readonly';
let cachedToken;

async function accessToken(rawCredentials) {
  const now = Date.now();
  if (cachedToken?.credentials === rawCredentials && cachedToken.expires > now + 60_000) {
    return cachedToken.value;
  }

  const { client_email, private_key, private_key_id } = JSON.parse(rawCredentials);
  const key = await importPKCS8(private_key, 'RS256');
  const assertion = await new SignJWT({ scope: calendarScope })
    .setProtectedHeader({ alg: 'RS256', kid: private_key_id })
    .setIssuer(client_email)
    .setAudience(tokenUrl)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
  const response = await fetch(tokenUrl, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    redirect: 'manual',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error('Google token unavailable');

  const { access_token, expires_in } = await response.json();
  if (typeof access_token !== 'string' || !Number.isFinite(expires_in)) {
    throw new Error('Invalid Google token response');
  }
  cachedToken = { credentials: rawCredentials, value: access_token, expires: now + expires_in * 1000 };
  return access_token;
}

export function eventsByDay(events, days) {
  return days.slice(0, -1).map((day, index) => {
    const nextDay = days[index + 1];
    const start = Date.parse(day.start);
    const end = Date.parse(nextDay.start);
    const allDay = [];
    const timed = [];

    for (const event of events) {
      const title = event.visibility === 'private' ? 'Ocupat' : event.summary || 'Sense títol';
      if (event.start?.date && event.end?.date) {
        if (event.start.date <= day.date && day.date < event.end.date) {
          allDay.push({ id: event.id, title, start: null });
        }
      } else {
        const eventStart = Date.parse(event.start?.dateTime);
        const eventEnd = Date.parse(event.end?.dateTime);
        if (eventStart < end && eventEnd > start) {
          timed.push({
            id: event.id,
            title,
            start: event.start.dateTime,
            continues: eventStart < start,
          });
        }
      }
    }

    return { date: day.date, events: [...allDay, ...timed] };
  });
}

export async function getFamilyCalendar(env, now = new Date()) {
  const days = calendarDays(now, 8);
  const token = await accessToken(env.GOOGLE_CALENDAR_SERVICE_ACCOUNT);
  const calendarId = encodeURIComponent(env.GOOGLE_CALENDAR_ID.trim());
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`);
  url.search = new URLSearchParams({
    timeMin: days[0].start,
    timeMax: days.at(-1).start,
    timeZone,
    singleEvents: 'true',
    orderBy: 'startTime',
    showDeleted: 'false',
    fields: 'nextPageToken,items(id,summary,start(date,dateTime),end(date,dateTime),visibility)',
    maxResults: '250',
  });

  const events = [];
  for (let page = 0; page < 8; page += 1) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      if (response.status === 401) cachedToken = undefined;
      throw new Error('Google Calendar unavailable');
    }

    const { items = [], nextPageToken } = await response.json();
    events.push(...items);
    if (!nextPageToken) return { days: eventsByDay(events, days) };
    url.searchParams.set('pageToken', nextPageToken);
  }
  throw new Error('Too many Google Calendar pages');
}
