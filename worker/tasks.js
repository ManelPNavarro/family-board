import { dayKey } from '../shared/dates.js';
import { nextTaskDate, taskAssignees, taskPriorities, taskRecurrences, validDueDate } from '../shared/tasks.js';

const listPath = '/api/tasks';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fields = 'id, title, due_date AS dueDate, priority, completed, assignee, recurrence';

// The deploy token cannot reach D1's admin API. Apply this additive migration
// through the binding until the production database has been upgraded.
const migrationName = '0013_task_recurrence_and_assignee.sql';
const taskColumns = {
  "assignee": "ALTER TABLE tasks ADD COLUMN assignee TEXT CHECK (assignee IN ('manel', 'marina'))",
  "recurrence": "ALTER TABLE tasks ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'\n  CHECK (recurrence IN ('none', 'daily', 'weekly', 'fortnightly', 'monthly'))",
  "recurrence_day": "ALTER TABLE tasks ADD COLUMN recurrence_day INTEGER CHECK (recurrence_day BETWEEN 1 AND 31)",
  "revision": "ALTER TABLE tasks ADD COLUMN revision INTEGER NOT NULL DEFAULT 0"
};
const readyDatabases = new WeakSet();

async function ensureTaskSchema(db) {
  if (readyDatabases.has(db)) return;
  const getColumns = async () => new Set((await db.prepare("PRAGMA table_info('tasks')").all()).results.map(({ name }) => name));
  const columns = await getColumns();
  const missing = Object.keys(taskColumns).filter((name) => !columns.has(name));
  if (missing.length) {
    try {
      await db.batch([
        ...missing.map((name) => db.prepare(taskColumns[name])),
        db.prepare(`CREATE TABLE IF NOT EXISTS d1_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`),
        db.prepare('INSERT INTO d1_migrations (name) VALUES (?) ON CONFLICT(name) DO NOTHING').bind(migrationName),
      ]);
    } catch (error) {
      // Another request may have completed the migration first.
      const refreshed = await getColumns();
      if (missing.some((name) => !refreshed.has(name))) throw error;
    }
  }
  readyDatabases.add(db);
}

function task(row) {
  const { revision, recurrenceDay, ...data } = row;
  return { ...data, completed: row.completed === 1 };
}

function insertTask(db, id, values, condition = '', conditionParams = []) {
  return db.prepare(`
    INSERT INTO tasks (id, title, due_date, priority, assignee, recurrence, recurrence_day)
    SELECT ?, ?, ?, ?, ?, ?, ? ${condition}
    ON CONFLICT(id) DO NOTHING
  `).bind(id, values.title, values.dueDate, values.priority, values.assignee, values.recurrence,
    values.recurrenceDay, ...conditionParams);
}

export async function tasks(request, db, headers) {
  const url = new URL(request.url);
  const id = url.pathname === listPath ? null : url.pathname.slice(listPath.length + 1);
  const { method } = request;
  const result = (body, status = 200) => method === 'HEAD' || status === 204
    ? new Response(null, { status, headers })
    : Response.json(body, { status, headers });

  if (id !== null && !uuid.test(id)) return result({ error: 'not_found' }, 404);
  const allowed = id ? ['PATCH', 'DELETE'] : ['GET', 'HEAD', 'POST'];
  if (!allowed.includes(method)) {
    return new Response(null, { status: 405, headers: { ...headers, Allow: allowed.join(', ') } });
  }

  try {
    await ensureTaskSchema(db);
    if (method === 'GET' || method === 'HEAD') {
      const { results } = await db.prepare(`SELECT ${fields} FROM tasks ORDER BY rowid`).all();
      return result({ tasks: results.map(task) });
    }

    if (request.headers.get('Origin') !== url.origin) return result({ error: 'forbidden' }, 403);
    if (method === 'DELETE') {
      await db.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
      return result(null, 204);
    }

    const invalid = { error: 'invalid_task' };
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
      return result(invalid, 415);
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return result(invalid, 400);

    const { dueDate, priority, completed, recurrence, assignee } = body;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const hasDueDate = Object.hasOwn(body, 'dueDate');
    if ((Object.hasOwn(body, 'title') && (!title || title.length > 120)) ||
        (hasDueDate && dueDate !== null && !validDueDate(dueDate)) ||
        (priority !== undefined && !taskPriorities.includes(priority)) ||
        (recurrence !== undefined && (typeof recurrence !== 'string' || !Object.hasOwn(taskRecurrences, recurrence))) ||
        (assignee !== undefined && assignee !== null && (typeof assignee !== 'string' || !Object.hasOwn(taskAssignees, assignee))) ||
        (completed !== undefined && typeof completed !== 'boolean')) return result(invalid, 400);

    if (method === 'POST') {
      if (!title || typeof body.id !== 'string' || !uuid.test(body.id) ||
          (recurrence && recurrence !== 'none' && !dueDate)) return result(invalid, 400);
      const [, { results }] = await db.batch([
        insertTask(db, body.id, {
          title, dueDate: dueDate ?? null, priority: priority ?? 'normal', assignee: assignee ?? null,
          recurrence: recurrence ?? 'none', recurrenceDay: recurrence === 'monthly' ? Number(dueDate.slice(8)) : null,
        }),
        db.prepare(`SELECT ${fields} FROM tasks WHERE id = ?`).bind(body.id),
      ]);
      return result({ task: task(results[0]) }, 201);
    }

    if (!title && !hasDueDate && priority === undefined && completed === undefined &&
        recurrence === undefined && assignee === undefined) return result(invalid, 400);

    const current = await db.prepare(`
      SELECT ${fields}, recurrence_day AS recurrenceDay, revision FROM tasks WHERE id = ?
    `).bind(id).first();
    if (!current) return result({ error: 'not_found' }, 404);

    const updated = {
      title: title || current.title,
      dueDate: hasDueDate ? dueDate : current.dueDate,
      priority: priority ?? current.priority,
      assignee: assignee === undefined ? current.assignee : assignee,
      // Reopening a past occurrence makes it a one-off. Its successor keeps the schedule.
      recurrence: recurrence ?? (completed === false && current.completed ? 'none' : current.recurrence),
      completed: completed === undefined ? current.completed : Number(completed),
    };
    if (updated.recurrence !== 'none' && !updated.dueDate) return result(invalid, 400);
    updated.recurrenceDay = updated.recurrence === 'monthly'
      ? (updated.dueDate === current.dueDate && current.recurrenceDay) || Number(updated.dueDate.slice(8))
      : null;

    const update = db.prepare(`
      UPDATE tasks SET title = ?, due_date = ?, priority = ?, assignee = ?, recurrence = ?,
        recurrence_day = ?, completed = ?, revision = revision + 1
      WHERE id = ? AND revision = ?
      RETURNING ${fields}
    `).bind(updated.title, updated.dueDate, updated.priority, updated.assignee,
      updated.recurrence, updated.recurrenceDay, updated.completed, id, current.revision);

    const nextDate = completed && !current.completed
      ? nextTaskDate(updated.dueDate, updated.recurrence, updated.recurrenceDay, dayKey(new Date()))
      : null;
    if (!nextDate) {
      const row = await update.first();
      return row ? result({ task: task(row) }) : result({ error: 'conflict' }, 409);
    }

    // Both statements check the same revision inside one transaction so retries
    // and two people checking off the same occurrence cannot add a duplicate.
    const nextId = crypto.randomUUID();
    const [, done, next] = await db.batch([
      insertTask(db, nextId, { ...updated, dueDate: nextDate },
        'WHERE EXISTS (SELECT 1 FROM tasks WHERE id = ? AND revision = ? AND completed = 0)',
        [id, current.revision]),
      update,
      db.prepare(`SELECT ${fields} FROM tasks WHERE id = ?`).bind(nextId),
    ]);
    if (!done.results.length) return result({ error: 'conflict' }, 409);
    return result({ task: task(done.results[0]), nextTask: task(next.results[0]) });
  } catch {
    return result({ error: 'unavailable' }, 503);
  }
}
