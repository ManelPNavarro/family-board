import assert from 'node:assert/strict';
import test from 'node:test';
import { exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { getFamilyCalendar } from './calendar.js';

test('reads only the configured calendar and groups events by day in Madrid', async (t) => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const credentials = {
    client_email: 'family-board@example.invalid',
    private_key: await exportPKCS8(privateKey),
  };
  const env = {
    GOOGLE_CALENDAR_ID: 'family@group.calendar.google.com',
    GOOGLE_CALENDAR_SERVICE_ACCOUNT: JSON.stringify(credentials),
  };

  const fetchGoogle = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.redirect, 'manual');
    if (url === 'https://oauth2.googleapis.com/token') {
      const { payload } = await jwtVerify(options.body.get('assertion'), publicKey, {
        issuer: credentials.client_email,
        audience: url,
      });
      assert.equal(payload.scope, 'https://www.googleapis.com/auth/calendar.events.readonly');
      return Response.json({ access_token: 'test-token', expires_in: 3600 });
    }

    assert.equal(url.pathname, '/calendar/v3/calendars/family%40group.calendar.google.com/events');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(url.searchParams.get('timeMin'), '2026-10-25T00:00:00+02:00');
    assert.equal(url.searchParams.get('timeMax'), '2026-11-01T00:00:00+01:00');
    assert.equal(url.searchParams.get('singleEvents'), 'true');

    if (url.searchParams.get('pageToken') === 'next') {
      return Response.json({ items: [{
        id: 'private',
        summary: 'Dato privado',
        visibility: 'private',
        description: 'Dato para omitir',
        start: { dateTime: '2026-10-25T23:30:00+01:00' },
        end: { dateTime: '2026-10-26T01:00:00+01:00' },
      }] });
    }

    return Response.json({ nextPageToken: 'next', items: [{
      id: 'all-day',
      summary: 'Birthday',
      start: { date: '2026-10-24' },
      end: { date: '2026-10-26' },
    }] });
  });

  const { days } = await getFamilyCalendar(env, new Date('2026-10-24T22:30:00Z'));
  assert.equal(days.length, 7);
  assert.deepEqual(days[0], {
    date: '2026-10-25',
    events: [
      { id: 'all-day', title: 'Birthday', start: null },
      { id: 'private', title: 'Ocupat', start: '2026-10-25T23:30:00+01:00', continues: false },
    ],
  });
  assert.deepEqual(days[1], {
    date: '2026-10-26',
    events: [{ id: 'private', title: 'Ocupat', start: '2026-10-25T23:30:00+01:00', continues: true }],
  });

  assert.deepEqual(await getFamilyCalendar(env, new Date('2026-10-24T22:30:59Z')), { days });
  assert.equal(fetchGoogle.mock.callCount(), 3);
  assert.deepEqual(await getFamilyCalendar(env, new Date('2026-10-24T22:31:00Z')), { days });
  assert.equal(fetchGoogle.mock.callCount(), 5);
});
