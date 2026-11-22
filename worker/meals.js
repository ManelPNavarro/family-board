import { mondayOf, shiftDate, validDate } from '../shared/dates.js';
import { mealNotesLimit, mealTypes } from '../shared/meals.js';

export async function meals(request, db, headers) {
  const url = new URL(request.url);
  const { method } = request;
  const result = (body, status = 200) => method === 'HEAD'
    ? new Response(null, { status, headers })
    : Response.json(body, { status, headers });
  if (!['GET', 'HEAD', 'PUT'].includes(method)) {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD, PUT' } });
  }

  try {
    if (method !== 'PUT') {
      const week = url.searchParams.get('week');
      if (!validDate(week) || mondayOf(week) !== week) return result({ error: 'invalid_week' }, 400);
      const { results } = await db.prepare('SELECT date, meal, notes FROM meals WHERE date BETWEEN ? AND ?')
        .bind(week, shiftDate(week, 6)).all();
      return result({ meals: results });
    }

    if (request.headers.get('Origin') !== url.origin) return result({ error: 'forbidden' }, 403);
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
      return result({ error: 'invalid_meal' }, 415);
    }
    const body = await request.json().catch(() => null);
    const { date, meal, notes } = body ?? {};
    if (!validDate(date) || !mealTypes.includes(meal) || typeof notes !== 'string' ||
        notes.length > mealNotesLimit) return result({ error: 'invalid_meal' }, 400);

    const trimmed = notes.trim();
    if (trimmed) {
      await db.prepare(`
        INSERT INTO meals (date, meal, notes) VALUES (?, ?, ?)
        ON CONFLICT(date, meal) DO UPDATE SET notes = excluded.notes
      `).bind(date, meal, trimmed).run();
    } else {
      await db.prepare('DELETE FROM meals WHERE date = ? AND meal = ?').bind(date, meal).run();
    }
    return result({ date, meal, notes: trimmed });
  } catch {
    return result({ error: 'unavailable' }, 503);
  }
}
