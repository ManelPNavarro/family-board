import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { grocerySuggestions } from '../shared/grocery-suggestions.js';
import { groceryProduceDefault, isFreshProduce } from '../shared/grocery-produce.js';
import { groceries } from './groceries.js';

test('the shared list persists edits and rejects cross-origin writes', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../migrations/0001_groceries.sql', import.meta.url), 'utf8'));
  const existing = '12345678-1234-4567-89ab-123456789013';
  db.prepare('INSERT INTO grocery_items (id, title, checked) VALUES (?, ?, 1)').run(existing, 'Cafè');
  db.exec(await readFile(new URL('../migrations/0002_grocery_history.sql', import.meta.url), 'utf8'));
  db.exec(await readFile(new URL('../migrations/0003_grocery_produce.sql', import.meta.url), 'utf8'));
  const d1 = {
    batch: async (statements) => Promise.all(statements.map((statement) => statement.all())),
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        all: async () => ({ results: statement.all() }),
        bind: (...params) => ({
          run: async () => statement.run(...params),
          all: async () => ({ results: statement.all(...params) }),
        }),
      };
    },
  };
  const origin = 'https://family-board.example';
  const id = '12345678-1234-4567-89ab-123456789012';
  function send(method, suffix = '', data, requestOrigin = origin) {
    return groceries(new Request(`${origin}/api/groceries${suffix}`, {
      method,
      headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    }), d1, { 'Cache-Control': 'private, no-store' });
  }

  assert.deepEqual(await (await send('GET', '/history')).json(), { titles: ['Cafè'], products: [{ title: 'Cafè', produce: false }] });
  assert.equal((await send('POST', '/history', {})).status, 405);
  assert.equal((await send('DELETE', `/${existing}`)).status, 204);

  assert.equal((await send('POST', '', { id, title: 'Llet' }, 'https://other.example')).status, 403);
  assert.equal((await send('POST', '', { id, title: '  ' })).status, 400);
  assert.deepEqual(await (await send('GET')).json(), { items: [] });

  const created = await send('POST', '', { id, title: ' Llet ' });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { item: { id, title: 'Llet', checked: false, produce: false } });

  assert.equal((await send('PATCH', `/${id}`, { checked: 'true' })).status, 400);
  assert.equal((await send('PATCH', `/${id}`, { checked: true })).status, 200);
  assert.equal((await send('PATCH', `/${id}`, { title: 'Llet sencera' })).status, 200);
  assert.equal((await send('POST', '', { id, title: ' Llet ' })).status, 201);
  assert.deepEqual(await (await send('GET')).json(), {
    items: [{ id, title: 'Llet sencera', checked: true, produce: false }],
  });

  assert.equal((await send('DELETE', `/${id}`)).status, 204);
  assert.equal((await send('DELETE', `/${id}`)).status, 204);
  assert.equal((await send('PATCH', `/${id}`, { checked: false })).status, 404);
  assert.deepEqual(await (await send('GET')).json(), { items: [] });
  assert.deepEqual(new Set((await (await send('GET', '/history')).json()).titles),
    new Set(['Llet', 'Llet sencera', 'Cafè']));
  assert.equal(db.prepare("SELECT times_added FROM grocery_history WHERE title = 'Llet'").get().times_added, 1);
  assert.equal((await send('POST', '', { id, title: 'Pomes', produce: 'sí' })).status, 400);
  assert.equal((await send('POST', '', { id, title: 'Pomes', produce: true })).status, 201);
  assert.equal((await send('POST', '', { id, title: 'Pomes', produce: false })).status, 201);
  assert.equal((await (await send('GET')).json()).items[0].produce, true);
  assert.equal((await send('DELETE', `/${id}`)).status, 204);
  assert.equal((await send('POST', '', { id: existing, title: 'Pomes' })).status, 201);
  assert.equal((await (await send('GET')).json()).items[0].produce, true);
  assert.equal((await send('PATCH', `/${existing}`, { produce: false })).status, 200);
  assert.equal((await (await send('GET')).json()).items[0].produce, false);
  assert.equal((await send('PATCH', `/${existing}`, { title: 'Peres', produce: true })).status, 200);
  const { products } = await (await send('GET', '/history')).json();
  assert.deepEqual(products.find(({ title }) => title === 'Peres'), { title: 'Peres', produce: true });
  assert.equal((await send('POST', '', { id, title: 'Pomes', suggestedProduce: true })).status, 201);
  assert.equal((await (await send('GET')).json()).items.find((entry) => entry.id === id).produce, false);
  assert.equal((await send('DELETE', `/${id}`)).status, 204);
  assert.equal((await send('POST', '', { id, title: 'Mandarines', suggestedProduce: true })).status, 201);
  assert.equal((await (await send('GET')).json()).items.find((entry) => entry.id === id).produce, true);

  assert.equal((await send('PATCH', `/${id}`, { checked: true })).status, 200);
  const retryableAdd = { id: '12345678-1234-4567-89ab-123456789014', title: ' mandarines ' };
  const restored = { id, title: 'Mandarines', checked: false, produce: true };
  for (const request of [retryableAdd, retryableAdd, { ...retryableAdd, id: crypto.randomUUID() }]) {
    const response = await send('POST', '', request);
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { item: restored });
  }
  const { items } = await (await send('GET')).json();
  assert.deepEqual(items.filter(({ title }) => title.toLowerCase() === 'mandarines'), [restored]);
  db.close();
});


test('suggestions ignore accents, rank prefix matches first, and hide active items', () => {
  const history = ['Pa de cafè', 'Cafè', 'Cafe', 'Cafetera', 'Llet'];
  assert.deepEqual(grocerySuggestions(' cAf ', history, [{ title: 'Cafetera' }]), ['Cafè', 'Pa de cafè']);
  assert.deepEqual(grocerySuggestions('cafe', history, []), ['Cafè', 'Cafetera', 'Pa de cafè']);
  assert.deepEqual(grocerySuggestions('', history, []), []);
});


test('detects fresh produce in Catalan and excludes common prepared products', () => {
  for (const title of ['POMES', 'tomàquet de penjar', '1,5 kg de taronges', "2 kg d’alvocats", 'mongeta tendra']) {
    assert.equal(isFreshProduce(title), true, title);
  }
  for (const title of ['', 'caldo de verdures', 'iogurt de maduixa', 'patates xips', 'pèsols congelats', 'tomàquet triturat', 'tomàquet fregit', 'mongetes seques']) {
    assert.equal(isFreshProduce(title), false, title);
  }
});


test('shares categories across singular and plural forms and preserves exact choices', () => {
  assert.equal(isFreshProduce('plàtan'), true);
  assert.equal(isFreshProduce('PLÀTANS'), true);
  assert.equal(groceryProduceDefault('2 kg de plàtans', [{ title: 'Plàtan', produce: true }]), true);
  assert.equal(groceryProduceDefault('plàtans', [{ title: 'Plàtan', produce: false }]), false);
  assert.equal(groceryProduceDefault('plàtans', [
    { title: 'Plàtan', produce: true }, { title: 'Plàtans', produce: false },
  ]), false);
  assert.equal(groceryProduceDefault('tomàquets de pot', [{ title: 'Tomàquet', produce: true }]), false);
});
