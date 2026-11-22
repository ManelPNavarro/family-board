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
      const weekEnd = shiftDate(week, 6);
      const [plan, settings] = await db.batch([
        db.prepare(`
          SELECT date, meal, MAX(notes) AS notes, MAX(school) AS school
          FROM (
            SELECT date, meal, notes, 0 AS school FROM meals WHERE date BETWEEN ? AND ?
            UNION ALL
            SELECT date, meal, '' AS notes, 1 AS school FROM meal_school_slots WHERE date BETWEEN ? AND ?
          )
          GROUP BY date, meal
        `).bind(week, weekEnd, week, weekEnd),
        db.prepare("SELECT value FROM meal_settings WHERE key = 'school_label'"),
      ]);
      return result({
        meals: plan.results.map((entry) => ({ ...entry, school: entry.school === 1 })),
        schoolLabel: settings.results[0]?.value ?? 'Escola',
      });
    }

    if (request.headers.get('Origin') !== url.origin) return result({ error: 'forbidden' }, 403);
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
      return result({ error: 'invalid_meal' }, 415);
    }
    const body = await request.json().catch(() => null);
    const { date, meal, notes, school } = body ?? {};
    if (!validDate(date) || !mealTypes.includes(meal) || typeof notes !== 'string' ||
        notes.length > mealNotesLimit || (school !== undefined && typeof school !== 'boolean')) {
      return result({ error: 'invalid_meal' }, 400);
    }

    const trimmed = notes.trim();
    const saveNotes = trimmed
      ? db.prepare(`
        INSERT INTO meals (date, meal, notes) VALUES (?, ?, ?)
        ON CONFLICT(date, meal) DO UPDATE SET notes = excluded.notes
      `).bind(date, meal, trimmed)
      : db.prepare('DELETE FROM meals WHERE date = ? AND meal = ?').bind(date, meal);
    if (school === undefined) {
      await saveNotes.run();
      return result({ date, meal, notes: trimmed });
    }

    const saveSchool = school
      ? db.prepare('INSERT INTO meal_school_slots (date, meal) VALUES (?, ?) ON CONFLICT(date, meal) DO NOTHING')
      : db.prepare('DELETE FROM meal_school_slots WHERE date = ? AND meal = ?');
    await db.batch([saveNotes, saveSchool.bind(date, meal)]);
    return result({ date, meal, notes: trimmed, school });
  } catch {
    return result({ error: 'unavailable' }, 503);
  }
}
