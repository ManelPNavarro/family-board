import { mondayOf, shiftDate, validDate } from '../shared/dates.js';
import { coursesPerMeal, mealDishLimit, mealNotesLimit, mealTypes } from '../shared/meals.js';
import { searchKey } from '../shared/grocery-suggestions.js';

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
      const [plan, settings, history] = await db.batch([
        db.prepare(`
          WITH slots AS (
            SELECT date, meal, MAX(notes) AS notes, MAX(school) AS school
            FROM (
              SELECT date, meal, notes, 0 AS school FROM meals WHERE date BETWEEN ? AND ?
              UNION ALL
              SELECT date, meal, '', 1 FROM meal_school_slots WHERE date BETWEEN ? AND ?
              UNION ALL
              SELECT date, meal, '', 0 FROM meal_courses WHERE date BETWEEN ? AND ?
              UNION ALL
              SELECT date, meal, '', 0 FROM meal_dishes WHERE date BETWEEN ? AND ?
            )
            GROUP BY date, meal
          )
          SELECT slots.*, courses.first_course, courses.second_course, courses.dessert, dish_list.dishes
          FROM slots LEFT JOIN meal_courses courses USING (date, meal)
          LEFT JOIN meal_dishes dish_list USING (date, meal)
        `).bind(week, weekEnd, week, weekEnd, week, weekEnd, week, weekEnd),
        db.prepare("SELECT value FROM meal_settings WHERE key = 'school_label'"),
        db.prepare(`
          SELECT course, title FROM (
            SELECT course, title, last_seen FROM meal_course_history
            UNION ALL
            SELECT NULL AS course, title, last_seen FROM meal_dish_history
          )
          ORDER BY last_seen DESC, title COLLATE NOCASE
        `),
      ]);
      const courseHistory = Array.from({ length: coursesPerMeal }, () => []);
      for (const { course, title } of history.results) {
        if (course !== null) courseHistory[course].push(title);
      }
      return result({
        meals: plan.results.map(({ date, meal, notes, school, first_course, second_course, dessert, dishes }) => {
          const courses = first_course === null ? null : [first_course, second_course, dessert];
          const items = dishes === null ? null : JSON.parse(dishes);
          return {
            date, meal, school: school === 1,
            notes: items ? items.join(' · ') : courses ? courses.filter(Boolean).join(' · ') : notes,
            ...(courses && { courses }),
            ...(items && { dishes: items }),
          };
        }),
        schoolLabel: settings.results[0]?.value ?? 'Escola',
        courseHistory,
        dishHistory: [...new Set(history.results.map(({ title }) => title))],
      });
    }

    if (request.headers.get('Origin') !== url.origin) return result({ error: 'forbidden' }, 403);
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
      return result({ error: 'invalid_meal' }, 415);
    }
    const body = await request.json().catch(() => null);
    const { date, meal, notes, school, courses, dishes } = body ?? {};
    const validText = (value) => typeof value === 'string' && value.length <= mealNotesLimit;
    const structured = courses !== undefined;
    const list = dishes !== undefined;
    if (!validDate(date) || !mealTypes.includes(meal) || (school !== undefined && typeof school !== 'boolean') ||
        (list && (!Array.isArray(dishes) || dishes.length > mealDishLimit || !dishes.every(validText))) ||
        (structured && (!Array.isArray(courses) || courses.length !== coursesPerMeal || !courses.every(validText))) ||
        (!list && !structured && !validText(notes))) {
      return result({ error: 'invalid_meal' }, 400);
    }

    const trimmed = list || structured ? '' : notes.trim();
    const saveNotes = trimmed
      ? db.prepare(`
        INSERT INTO meals (date, meal, notes) VALUES (?, ?, ?)
        ON CONFLICT(date, meal) DO UPDATE SET notes = excluded.notes
      `).bind(date, meal, trimmed)
      : db.prepare('DELETE FROM meals WHERE date = ? AND meal = ?').bind(date, meal);
    const statements = [saveNotes];
    if (school !== undefined) {
      const saveSchool = school
        ? db.prepare('INSERT INTO meal_school_slots (date, meal) VALUES (?, ?) ON CONFLICT(date, meal) DO NOTHING')
        : db.prepare('DELETE FROM meal_school_slots WHERE date = ? AND meal = ?');
      statements.push(saveSchool.bind(date, meal));
    }

    if (list) {
      const items = dishes.map((title) => title.trim()).filter(Boolean);
      statements.push(db.prepare('DELETE FROM meal_courses WHERE date = ? AND meal = ?').bind(date, meal));
      statements.push(items.length
        ? db.prepare(`
          INSERT INTO meal_dishes (date, meal, dishes) VALUES (?, ?, ?)
          ON CONFLICT(date, meal) DO UPDATE SET dishes = excluded.dishes
        `).bind(date, meal, JSON.stringify(items))
        : db.prepare('DELETE FROM meal_dishes WHERE date = ? AND meal = ?').bind(date, meal));
      if (!school && items.length) {
        const names = items.map((title) => ({ name: searchKey(title), title }));
        statements.push(db.prepare(`
          INSERT INTO meal_dish_history (name_key, title, last_seen)
          SELECT json_extract(value, '$.name'), json_extract(value, '$.title'), unixepoch()
          FROM json_each(?) WHERE 1
          ON CONFLICT(name_key) DO UPDATE SET last_seen = excluded.last_seen
        `).bind(JSON.stringify(names)));
      }
      await db.batch(statements);
      return result({ date, meal, school, notes: items.join(' · '), dishes: items });
    }

    const savedCourses = structured ? courses.map((text) => text.trim()) : null;
    if (savedCourses) {
      statements.push(savedCourses.some(Boolean)
        ? db.prepare(`
          INSERT INTO meal_courses (date, meal, first_course, second_course, dessert) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(date, meal) DO UPDATE SET first_course = excluded.first_course,
            second_course = excluded.second_course, dessert = excluded.dessert
        `).bind(date, meal, ...savedCourses)
        : db.prepare('DELETE FROM meal_courses WHERE date = ? AND meal = ?').bind(date, meal));
      if (!school) {
        for (const [course, title] of savedCourses.entries()) {
          if (!title) continue;
          statements.push(db.prepare(`
            INSERT INTO meal_course_history (course, name_key, title, last_seen) VALUES (?, ?, ?, unixepoch())
            ON CONFLICT(course, name_key) DO UPDATE SET last_seen = excluded.last_seen
          `).bind(course, searchKey(title), title));
        }
      }
    }
    await db.batch(statements);
    return result({
      date, meal, school,
      notes: savedCourses ? savedCourses.filter(Boolean).join(' · ') : trimmed,
      ...(savedCourses && { courses: savedCourses }),
    });
  } catch {
    return result({ error: 'unavailable' }, 503);
  }
}
