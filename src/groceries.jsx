import React, { useEffect, useRef, useState } from 'react';
import { Check, Leaf, Pencil, Plus, ShoppingBasket, Trash2, X } from 'lucide-react';
import { grocerySuggestions, searchKey } from '../shared/grocery-suggestions.js';

const path = '/api/groceries';
const messages = {
  loading: 'S’està carregant la llista…',
  session: 'Actualitza la pàgina per renovar la sessió.',
  unavailable: 'No s’ha pogut carregar la llista.',
  save: 'No s’ha pogut desar el canvi. Torna-ho a provar.',
};

async function api(url, options) {
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'manual',
    ...options,
  });
  if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403) {
    throw new Error('session');
  }
  if (!response.ok) throw new Error('unavailable');
  return response.status === 204 ? null : response.json();
}

export function GroceryList({ standalone = false }) {
  const [items, setItems] = useState(null);
  const [draft, setDraft] = useState('');
  const [draftProduce, setDraftProduce] = useState(null);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const refreshRequest = useRef(null);
  const pending = useRef(false);
  const creation = useRef(null);
  const addInput = useRef(null);
  const firstSuggestion = useRef(null);
  const historyRequest = useRef(null);

  async function loadHistory() {
    historyRequest.current?.abort();
    const controller = new AbortController();
    historyRequest.current = controller;
    try {
      const { products } = await api(`${path}/history`, { signal: controller.signal });
      if (!controller.signal.aborted) setHistory(products ?? []);
    } catch {
      // A failed history request should not interrupt adding an item.
    }
  }

  function selectSuggestion(title) {
    setDraft(title);
    setDraftProduce(null);
    addInput.current?.focus();
    setSuggestionsOpen(false);
  }

  async function refresh() {
    if (pending.current) return;
    refreshRequest.current?.abort();
    const controller = new AbortController();
    refreshRequest.current = controller;
    try {
      const { items } = await api(path, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setItems(items);
        setMessage((current) => current === 'save' ? current : '');
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error.message === 'session' ? 'session' : 'unavailable');
    }
  }

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    const interval = window.setInterval(refreshIfVisible, 15_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      refreshRequest.current?.abort();
      historyRequest.current?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, []);

  async function write(method, id, data) {
    if (pending.current) return false;
    pending.current = true;
    refreshRequest.current?.abort();
    setBusy(true);
    setMessage('');
    try {
      const result = await api(id ? `${path}/${id}` : path, {
        method,
        ...(data && {
          body: JSON.stringify(data),
          headers: { 'Content-Type': 'application/json' },
        }),
      });
      setItems((previous) => {
        if (method === 'DELETE') return previous.filter((entry) => entry.id !== id);
        const { item } = result;
        return previous.some((entry) => entry.id === item.id)
          ? previous.map((entry) => entry.id === item.id ? item : entry)
          : [...previous, item];
      });
      return true;
    } catch (error) {
      setMessage(error.message === 'session' ? 'session' : 'save');
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
      void refresh();
    }
  }

  async function add(event) {
    event.preventDefault();
    const title = draft.trim();
    if (!title || pending.current) return;
    const produce = draftProduce ?? rememberedProduce;
    if (creation.current?.title !== title) {
      creation.current = { id: crypto.randomUUID(), title };
    }

    if (await write('POST', null, { ...creation.current, produce })) {
      creation.current = null;
      setDraft('');
      setDraftProduce(null);
      addInput.current?.focus();
      void loadHistory();
    }
  }

  async function rename(event) {
    event.preventDefault();
    const title = editing.title.trim();
    const changes = {};
    if (title !== editing.originalTitle) changes.title = title;
    if (changes.title || editing.produce !== editing.originalProduce) changes.produce = editing.produce;
    if (!Object.keys(changes).length || (title && await write('PATCH', editing.id, changes))) {
      setEditing(null);
    }
  }

  const enabled = items !== null && message !== 'session';
  const active = items?.filter((item) => !item.checked) ?? [];
  const checked = items?.filter((item) => item.checked) ?? [];
  const draftKey = searchKey(draft);
  const knownProduct = history.find(({ title }) => title.toLocaleLowerCase('ca') === draft.trim().toLocaleLowerCase('ca'))
    ?? history.find(({ title }) => searchKey(title) === draftKey);
  const rememberedProduce = knownProduct?.produce;
  const suggestions = suggestionsOpen && enabled && !busy
    ? grocerySuggestions(draft, history.map(({ title }) => title), active)
    : [];
  const Heading = standalone ? 'h1' : 'h2';

  function renderItem(item) {
    return (
      <li className={`grocery-item${item.checked ? ' grocery-item-checked' : ''}${item.produce ? ' grocery-item-produce' : ''}`} key={item.id}>
        {editing?.id === item.id ? (
          <form className="grocery-edit" onSubmit={rename}>
            <div className="grocery-edit-fields">
              <input className="grocery-name" aria-label="Nom del producte" maxLength={120} value={editing.title} autoFocus
                readOnly={busy} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
              <label className="grocery-produce-toggle">
                <input type="checkbox" checked={editing.produce} disabled={busy}
                  onChange={(event) => setEditing({ ...editing, produce: event.target.checked })} />
                Fruita o verdura
              </label>
            </div>
            <button type="submit" disabled={!editing.title.trim() || busy} aria-label="Desa el nom"><Check /></button>
            <button type="button" disabled={busy} onClick={() => setEditing(null)} aria-label="Cancel·la l’edició"><X /></button>
          </form>
        ) : (
          <>
            <label className="grocery-check">
              <input type="checkbox" checked={item.checked} disabled={busy || !enabled}
                onChange={(event) => void write('PATCH', item.id, { checked: event.target.checked })} />
              <span>{item.title}</span>
            </label>
            <div className="grocery-actions">
              <button type="button" disabled={busy || !enabled} aria-label={`Edita ${item.title}`}
                onClick={() => setEditing({ ...item, produce: Boolean(item.produce), originalTitle: item.title, originalProduce: Boolean(item.produce) })}><Pencil size={16} aria-hidden="true" /></button>
              <button type="button" disabled={busy || !enabled} aria-label={`Elimina ${item.title}`}
                onClick={() => void write('DELETE', item.id)}><Trash2 size={16} aria-hidden="true" /></button>
            </div>
          </>
        )}
      </li>
    );
  }

  return (
    <section className="card groceries" aria-labelledby="groceries">
      <header className="card-header grocery-heading">
        <span className="grocery-symbol"><ShoppingBasket size={23} aria-hidden="true" /></span>
        <Heading id="groceries">Llista de la compra</Heading>
      </header>
      <div
        className="grocery-composer"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setSuggestionsOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && suggestions.length) {
            addInput.current?.focus();
            setSuggestionsOpen(false);
          }
        }}
      >
        <form className="grocery-add" onSubmit={add}>
          <input ref={addInput} type="text" aria-label="Producte nou" placeholder="Afegeix un producte"
            autoComplete="off" value={draft} maxLength={120} readOnly={busy || !enabled}
            onFocus={() => {
              setSuggestionsOpen(true);
              void loadHistory();
            }}
            onChange={(event) => {
              setDraft(event.target.value);
              if (!event.target.value.trim()) setDraftProduce(null);
              setSuggestionsOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && suggestions.length) {
                event.preventDefault();
                firstSuggestion.current?.focus();
              }
            }} />
          <button type="submit" disabled={!enabled || busy || !draft.trim()}><Plus size={18} aria-hidden="true" /> Afegeix</button>
        </form>
        <label className="grocery-produce-toggle grocery-add-produce">
          <input type="checkbox" checked={draftProduce ?? rememberedProduce ?? false} disabled={busy || !enabled}
            onChange={(event) => setDraftProduce(event.target.checked)} />
          Fruita o verdura
        </label>
        {suggestions.length > 0 && (
          <ul className="grocery-suggestions" aria-label="Productes suggerits">
            {suggestions.map((title, index) => (
              <li key={title}>
                <button type="button" ref={index === 0 ? firstSuggestion : null}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => selectSuggestion(title)}>{title}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {message && <p className="agenda-message" role="status">{messages[message]}</p>}
      {items?.length === 0 && <p className="grocery-empty">La llista és buida.</p>}
      {items?.length > 0 && active.length === 0 && <p className="grocery-empty">Ja ho heu comprat tot.</p>}
      {[
        { id: 'produce', title: 'Fruita i verdura', entries: active.filter((item) => item.produce) },
        { id: 'other', title: 'Resta de la compra', entries: active.filter((item) => !item.produce) },
      ].filter(({ entries }) => entries.length).map(({ id, title, entries }) => (
        <section className={`grocery-group grocery-group-${id}`} key={id} aria-labelledby={`grocery-${id}`}>
          <h3 id={`grocery-${id}`}>
            {id === 'produce' && <Leaf size={18} aria-hidden="true" />}
            {title}
            <span>{entries.length}</span>
          </h3>
          <ul className="grocery-items" aria-labelledby={`grocery-${id}`}>{entries.map(renderItem)}</ul>
        </section>
      ))}
      {checked.length > 0 && (
        <section className="grocery-group grocery-checked" aria-labelledby="grocery-done">
          <h3 id="grocery-done">Comprats <span>{checked.length}</span></h3>
          <ul className="grocery-items" aria-labelledby="grocery-done">{checked.map(renderItem)}</ul>
        </section>
      )}
    </section>
  );
}
