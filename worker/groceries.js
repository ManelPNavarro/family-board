const listPath = '/api/groceries';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const columns = 'id, title, checked';

function item(row) {
  return { ...row, checked: row.checked === 1 };
}

function validTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  return title.length > 0 && title.length <= 120 ? title : null;
}

export async function groceries(request, db, headers) {
  const url = new URL(request.url);
  const id = url.pathname === listPath ? null : url.pathname.slice(listPath.length + 1);
  const method = request.method;
  const result = (body, status = 200) => method === 'HEAD' || status === 204
    ? new Response(null, { status, headers })
    : Response.json(body, { status, headers });

  if (id !== null && !uuid.test(id)) return result({ error: 'not_found' }, 404);

  try {
    if (!id && (method === 'GET' || method === 'HEAD')) {
      const { results } = await db.prepare(
        `SELECT ${columns} FROM grocery_items ORDER BY rowid`,
      ).all();
      return result({ items: results.map(item) });
    }

    const allowed = id ? ['PATCH', 'DELETE'] : ['GET', 'HEAD', 'POST'];
    if (!allowed.includes(method)) {
      return new Response(null, { status: 405, headers: { ...headers, Allow: allowed.join(', ') } });
    }
    if (request.headers.get('Origin') !== url.origin) return result({ error: 'forbidden' }, 403);

    if (method === 'DELETE') {
      await db.prepare('DELETE FROM grocery_items WHERE id = ?').bind(id).run();
      return result(null, 204);
    }

    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
      return result({ error: 'invalid_item' }, 415);
    }
    const body = await request.json().catch(() => null);
    const title = validTitle(body?.title);

    if (method === 'POST') {
      if (!title || typeof body?.id !== 'string' || !uuid.test(body.id)) {
        return result({ error: 'invalid_item' }, 400);
      }
      // Retries of a creation with the same ID must not undo another device's edits.
      await db.prepare('INSERT INTO grocery_items (id, title) VALUES (?, ?) ON CONFLICT(id) DO NOTHING')
        .bind(body.id, title).run();
      const row = await db.prepare(`SELECT ${columns} FROM grocery_items WHERE id = ?`)
        .bind(body.id).first();
      return row ? result({ item: item(row) }, 201) : result({ error: 'not_found' }, 404);
    }

    const hasChecked = typeof body?.checked === 'boolean';
    if ((!title && !hasChecked) || (Object.hasOwn(body, 'title') && !title) ||
        (Object.hasOwn(body, 'checked') && !hasChecked)) {
      return result({ error: 'invalid_item' }, 400);
    }
    const row = await db.prepare(`
      UPDATE grocery_items
      SET title = COALESCE(?, title), checked = COALESCE(?, checked)
      WHERE id = ?
      RETURNING ${columns}
    `).bind(title, hasChecked ? Number(body.checked) : null, id).first();
    return row ? result({ item: item(row) }) : result({ error: 'not_found' }, 404);
  } catch {
    return result({ error: 'unavailable' }, 503);
  }
}
