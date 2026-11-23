import { taskPriorities, validDueDate } from '../shared/tasks.js';

const listPath = '/api/tasks';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fields = 'id, title, due_date AS dueDate, priority, completed';

function task(row) {
  return { ...row, completed: row.completed === 1 };
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

    const { dueDate, priority, completed } = body;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const hasDueDate = Object.hasOwn(body, 'dueDate');
    if ((Object.hasOwn(body, 'title') && (!title || title.length > 120)) ||
        (hasDueDate && dueDate !== null && !validDueDate(dueDate)) ||
        (priority !== undefined && !taskPriorities.includes(priority)) ||
        (completed !== undefined && typeof completed !== 'boolean')) return result(invalid, 400);

    if (method === 'POST') {
      if (!title || typeof body.id !== 'string' || !uuid.test(body.id)) return result(invalid, 400);
      const [, { results }] = await db.batch([
        db.prepare('INSERT INTO tasks (id, title, due_date, priority) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
          .bind(body.id, title, dueDate ?? null, priority ?? 'normal'),
        db.prepare(`SELECT ${fields} FROM tasks WHERE id = ?`).bind(body.id),
      ]);
      return result({ task: task(results[0]) }, 201);
    }

    if (!title && !hasDueDate && priority === undefined && completed === undefined) return result(invalid, 400);
    const row = await db.prepare(`
      UPDATE tasks SET
        title = COALESCE(?, title),
        due_date = CASE WHEN ? THEN ? ELSE due_date END,
        priority = COALESCE(?, priority),
        completed = COALESCE(?, completed)
      WHERE id = ?
      RETURNING ${fields}
    `).bind(title || null, Number(hasDueDate), dueDate ?? null, priority ?? null,
      completed === undefined ? null : Number(completed), id).first();
    return row ? result({ task: task(row) }) : result({ error: 'not_found' }, 404);
  } catch {
    return result({ error: 'unavailable' }, 503);
  }
}
