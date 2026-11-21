const listPath = '/api/groceries';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const selectItems = `
  SELECT item.id, item.title, item.checked, COALESCE(history.produce, 0) AS produce
  FROM grocery_items item
  LEFT JOIN grocery_history history ON history.name_key = lower(trim(item.title))
`;
const matchingItemId = `
  SELECT id FROM grocery_items
  WHERE id = ? OR lower(trim(title)) = lower(trim(?))
  ORDER BY (id = ?) DESC, checked, rowid DESC
  LIMIT 1
`;

function item(row) {
  return { ...row, checked: row.checked === 1, produce: row.produce === 1 };
}

function validTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  return title.length > 0 && title.length <= 120 ? title : null;
}

export async function groceries(request, db, headers) {
  const url = new URL(request.url);
  const id = url.pathname === listPath ? null : url.pathname.slice(listPath.length + 1);
  const method = request.method;
  const history = id === 'history';
  const result = (body, status = 200) => method === 'HEAD' || status === 204
    ? new Response(null, { status, headers })
    : Response.json(body, { status, headers });

  if (id !== null && !history && !uuid.test(id)) return result({ error: 'not_found' }, 404);

  try {
    if (history) {
      if (method !== 'GET' && method !== 'HEAD') {
        return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
      }
      const { results } = await db.prepare(`
        SELECT title, produce FROM grocery_history
        ORDER BY times_added DESC, last_seen DESC, title COLLATE NOCASE
      `).all();
      return result({
        titles: results.map(({ title }) => title),
        products: results.map(({ title, produce }) => ({ title, produce: produce === 1 })),
      });
    }

    if (!id && (method === 'GET' || method === 'HEAD')) {
      const { results } = await db.prepare(
        `${selectItems} ORDER BY item.rowid`,
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
    const hasProduce = typeof body?.produce === 'boolean';
    if (body != null && Object.hasOwn(body, 'produce') && !hasProduce) {
      return result({ error: 'invalid_item' }, 400);
    }

    if (method === 'POST') {
      if (!title || typeof body?.id !== 'string' || !uuid.test(body.id)) {
        return result({ error: 'invalid_item' }, 400);
      }

      const match = [body.id, title, body.id];
      const statements = [];
      const suggestedProduce = body.suggestedProduce === true;
      if (hasProduce || suggestedProduce) {
        // A suggestion may initialize a product's category. Only a manual choice may override it.
        statements.push(db.prepare(`
          INSERT INTO grocery_history (name_key, title, times_added, last_seen, produce)
          SELECT lower(trim(?)), ?, 0, 0, ?
          WHERE NOT EXISTS (SELECT 1 FROM grocery_items WHERE id = ?)
          ON CONFLICT(name_key) DO UPDATE SET produce = excluded.produce WHERE ?
        `).bind(title, title, Number(hasProduce ? body.produce : suggestedProduce), body.id, Number(hasProduce)));
      }
      statements.push(
        db.prepare(`
          INSERT INTO grocery_items (id, title) VALUES (COALESCE((${matchingItemId}), ?), ?)
          ON CONFLICT(id) DO UPDATE SET checked = 0
          WHERE grocery_items.id <> ? AND grocery_items.checked = 1
        `).bind(...match, body.id, title, body.id),
        db.prepare(`${selectItems} WHERE item.id = (${matchingItemId})`).bind(...match),
      );
      const row = (await db.batch(statements)).at(-1).results[0];
      return row ? result({ item: item(row) }, 201) : result({ error: 'not_found' }, 404);
    }

    const hasChecked = typeof body?.checked === 'boolean';
    if ((!title && !hasChecked && !hasProduce) || (Object.hasOwn(body, 'title') && !title) ||
        (Object.hasOwn(body, 'checked') && !hasChecked)) {
      return result({ error: 'invalid_item' }, 400);
    }

    const statements = [
      db.prepare(`
        UPDATE grocery_items SET title = COALESCE(?, title), checked = COALESCE(?, checked)
        WHERE id = ?
      `).bind(title, hasChecked ? Number(body.checked) : null, id),
    ];
    if (hasProduce) {
      statements.push(db.prepare(`
        UPDATE grocery_history SET produce = ?
        WHERE name_key = (SELECT lower(trim(title)) FROM grocery_items WHERE id = ?)
      `).bind(Number(body.produce), id));
    }
    statements.push(db.prepare(`${selectItems} WHERE item.id = ?`).bind(id));
    const row = (await db.batch(statements)).at(-1).results[0];
    return row ? result({ item: item(row) }) : result({ error: 'not_found' }, 404);
  } catch {
    return result({ error: 'unavailable' }, 503);
  }
}
