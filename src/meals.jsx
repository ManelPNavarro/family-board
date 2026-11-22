import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Plus, School, Utensils, X } from 'lucide-react';
import { mondayOf, shiftDate } from '../shared/dates.js';
import { mealDishLimit, mealNotesLimit, mealTypes } from '../shared/meals.js';
import { grocerySuggestions, searchKey } from '../shared/grocery-suggestions.js';
import { api } from './api.js';

const endpoint = '/api/meals';
const mealLabels = { breakfast: 'Esmorzar', lunch: 'Dinar', snack: 'Berenar', dinner: 'Sopar' };
const dayFormat = new Intl.DateTimeFormat('ca-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekFormat = new Intl.DateTimeFormat('ca-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const atMidnight = (date) => new Date(`${date}T00:00:00Z`);
const mealKey = (date, meal) => `${date}:${meal}`;
const hasMeal = (entry) => Boolean(entry?.school || entry?.notes);
const sessionMessage = 'Actualitza la pàgina per renovar la sessió.';

function MealContents({ entry, schoolLabel }) {
  if (entry.school) {
    return <span className="meal-school"><School size={16} aria-hidden="true" />{schoolLabel}</span>;
  }
  if (entry.dishes?.length) {
    return <span className="meal-dish-summary">
      {entry.dishes.map((dish, index) => <span key={index} className="meal-cell-notes">{dish}</span>)}
    </span>;
  }
  return <span className="meal-cell-notes">{entry.notes}</span>;
}

function PlannedMeal({ entry, schoolLabel }) {
  return (
    <>
      <span className={`meal-type-badge meal-type-${entry.meal}`}>{mealLabels[entry.meal]}</span>
      <MealContents entry={entry} schoolLabel={schoolLabel} />
    </>
  );
}

export function TodayMenu({ today }) {
  const [plan, setPlan] = useState(null);

  useEffect(() => {
    let request;
    async function refresh() {
      if (document.visibilityState === 'hidden' || request) return;
      const controller = new AbortController();
      request = controller;
      try {
        const { meals, schoolLabel } = await api(`${endpoint}?date=${today}`, { signal: controller.signal });
        if (!controller.signal.aborted) setPlan({ date: today, meals, schoolLabel });
      } catch (failure) {
        if (!controller.signal.aborted && failure.message === 'session') setPlan(null);
      } finally {
        request = null;
      }
    }

    void refresh();
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      request?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [today]);

  if (plan?.date !== today) return null;
  const entries = mealTypes.map((type) => plan.meals.find((entry) => entry.meal === type)).filter(hasMeal);
  if (!entries.length) return null;

  return (
    <section className="card today-menu" aria-labelledby="today-menu-title">
      <header className="card-header">
        <span className="dashboard-card-icon"><Utensils size={21} aria-hidden="true" /></span>
        <h2 id="today-menu-title">Menú d’avui</h2>
        <a className="agenda-link" href="#menu">Veure menú <ArrowRight size={16} aria-hidden="true" /></a>
      </header>
      <ul className="today-meal-list">
        {entries.map((entry) => (
          <li key={entry.meal}><PlannedMeal entry={entry} schoolLabel={plan.schoolLabel} /></li>
        ))}
      </ul>
    </section>
  );
}

function MealWeek({ week, today }) {
  const [entries, setEntries] = useState(null);
  const [message, setMessage] = useState('S’està carregant el menú…');
  const [editor, setEditor] = useState(null);
  const [occupiedTypes, setOccupiedTypes] = useState([]);
  const [dishes, setDishes] = useState([]);
  const [draft, setDraft] = useState('');
  const [dishHistory, setDishHistory] = useState([]);
  const [school, setSchool] = useState(false);
  const [schoolLabel, setSchoolLabel] = useState('Escola');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  const dialog = useRef(null);
  const mealTypeField = useRef(null);
  const notesField = useRef(null);
  const schoolField = useRef(null);
  const dates = Array.from({ length: 7 }, (_, index) => shiftDate(week, index));

  useEffect(() => {
    async function refresh() {
      if (dialog.current.open) return;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      try {
        const data = await api(`${endpoint}?week=${week}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setEntries(Object.fromEntries(data.meals.map((entry) => [mealKey(entry.date, entry.meal), entry])));
        setSchoolLabel(data.schoolLabel ?? 'Escola');
        setDishHistory(data.dishHistory ?? []);
        setMessage('');
      } catch (failure) {
        if (!controller.signal.aborted) {
          setMessage(failure.message === 'session' ? sessionMessage : 'No s’ha pogut carregar el menú.');
        }
      }
    }
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    const interval = window.setInterval(refreshIfVisible, 30_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      request.current?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [week]);

  useEffect(() => {
    if (editor?.create && dialog.current.open) mealTypeField.current?.focus();
  }, [editor?.date, editor?.create]);

  function openEditor(date, meal = '') {
    const entry = entries[mealKey(date, meal)];
    setError('');
    setEditor({ date, meal, create: !meal });
    setOccupiedTypes(mealTypes.filter((type) => hasMeal(entries[mealKey(date, type)])));
    setDishes(entry?.dishes ?? (entry?.courses ?? [entry?.notes]).filter(Boolean));
    setDraft('');
    setSchool(entry?.school === true);
    dialog.current.showModal();
    if (meal) (entry?.school ? schoolField : notesField).current.focus();
  }

  async function save(event) {
    event.preventDefault();
    if (busy || !editor?.meal) return;
    const items = school ? dishes : withDraft(draft);
    request.current?.abort();
    setBusy(true);
    setError('');
    try {
      const saved = await api(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editor, dishes: items, school }),
      });
      setEntries((previous) => ({ ...previous, [mealKey(saved.date, saved.meal)]: saved }));
      if (!saved.school) {
        setDishHistory((previous) => [...new Set([...saved.dishes, ...previous])]);
      }
      dialog.current?.close();
    } catch (failure) {
      if (failure.status === 409) {
        setOccupiedTypes((previous) => [...previous, editor.meal]);
        setEditor({ ...editor, meal: '' });
        setError('Aquest tipus d’àpat ja està ocupat. Tria’n un altre.');
      } else {
        setError(failure.message === 'session' ? sessionMessage : 'No s’ha pogut desar l’àpat. Torna-ho a provar.');
      }
    } finally {
      setBusy(false);
    }
  }

  function withDraft(text) {
    const title = text.trim();
    if (!title || dishes.length >= mealDishLimit || dishes.some((dish) => searchKey(dish) === searchKey(title))) {
      return dishes;
    }
    return [...dishes, title];
  }

  function addDish(title) {
    setDishes(withDraft(title));
    setDraft('');
    notesField.current.focus();
  }

  const suggestions = school || dishes.length >= mealDishLimit ? [] :
    grocerySuggestions(draft, dishHistory, dishes.map((title) => ({ title })));

  return (
    <>
      {message && <p className="agenda-message" role="status">{message}</p>}
      {entries && (
        <ol className="meal-grid">
          {dates.map((date) => {
            const label = dayFormat.format(atMidnight(date));
            const slots = mealTypes.map((meal) => {
              const entry = entries[mealKey(date, meal)];
              return { meal, entry, value: entry?.school ? schoolLabel : entry?.notes };
            });
            const visibleSlots = slots.filter(({ entry }) => hasMeal(entry));
            return (
              <li key={date} className="meal-grid-row" data-today={date === today || undefined}>
                <h2><time dateTime={date} className="calendar-date">{label}</time>{date === today && <span>Avui</span>}</h2>
                {visibleSlots.map(({ meal, entry, value }) => (
                  <button className="meal-cell" data-school={entry?.school || undefined} key={meal} type="button" aria-haspopup="dialog"
                    aria-label={`${mealLabels[meal]}, ${label}: ${value}`}
                    disabled={message === sessionMessage} onClick={() => openEditor(date, meal)}>
                    <PlannedMeal entry={entry} schoolLabel={schoolLabel} />
                  </button>
                ))}
                {visibleSlots.length < mealTypes.length && (
                  <button className="meal-cell meal-add-slot" type="button" aria-haspopup="dialog"
                    aria-label={`Afegeix un àpat, ${label}`} disabled={message === sessionMessage}
                    onClick={() => openEditor(date)}>
                    <Plus className="meal-empty" size={20} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <dialog ref={dialog} className="grocery-dialog meal-dialog" aria-labelledby="meal-editor-title"
        onClose={() => {
          setSchool(false);
          setEditor(null);
        }}
        onCancel={(event) => { if (busy) event.preventDefault(); }}>
        <header className="grocery-dialog-header">
          <h2 id="meal-editor-title">Àpat</h2>
          <button type="button" aria-label="Tanca" disabled={busy} onClick={() => dialog.current.close()}><X size={20} /></button>
        </header>
        <form onSubmit={save}>
          {editor && <p className="calendar-date">{dayFormat.format(atMidnight(editor.date))}</p>}
          {editor?.create && (
            <label className="meal-type-label">
              Tipus d’àpat
              <select ref={mealTypeField} value={editor.meal} required disabled={busy}
                onChange={(event) => {
                  setEditor({ ...editor, meal: event.target.value });
                  setError('');
                }}>
                <option value="" disabled>Tria un tipus</option>
                {mealTypes.map((meal) => (
                  <option key={meal} value={meal} disabled={occupiedTypes.includes(meal)}>
                    {mealLabels[meal]}{occupiedTypes.includes(meal) ? ' · Ja planificat' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="meal-school-toggle">
            <input ref={schoolField} type="checkbox" checked={school} disabled={busy}
              onChange={(event) => setSchool(event.target.checked)} />
            {schoolLabel}
          </label>
          <div className="meal-dish-editor" hidden={school}>
            {dishes.length > 0 && (
              <ul className="meal-dish-list" aria-label="Plats de l’àpat">
                {dishes.map((dish, index) => (
                  <li key={index}>
                    <span>{dish}</span>
                    <button type="button" aria-label={`Treu ${dish}`} disabled={busy}
                      onClick={() => setDishes((previous) => previous.filter((_, item) => item !== index))}>
                      <X size={17} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="meal-dish-input">
              <input ref={notesField} value={draft} onChange={(event) => setDraft(event.target.value)}
                aria-label="Nom del plat" placeholder="Nom del plat" maxLength={mealNotesLimit}
                disabled={busy || school || dishes.length >= mealDishLimit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing && draft.trim()) {
                    event.preventDefault();
                    addDish(draft);
                  }
                }} />
              <button type="button" aria-label="Afegeix el plat" disabled={busy || withDraft(draft) === dishes}
                onClick={() => addDish(draft)}><Plus size={20} aria-hidden="true" /></button>
            </div>
            {suggestions.length > 0 && (
              <ul className="grocery-suggestions" aria-label="Plats suggerits">
                {suggestions.map((title) => (
                  <li key={title}><button type="button" disabled={busy} onClick={() => addDish(title)}>{title}</button></li>
                ))}
              </ul>
            )}
          </div>
          {error && <p role="alert" className="agenda-message">{error}</p>}
          <button type="submit" className="meal-save" disabled={busy || !editor?.meal}>Desa</button>
        </form>
      </dialog>
    </>
  );
}

export function Meals({ today }) {
  const [selectedWeek, setSelectedWeek] = useState(null);
  const currentWeek = mondayOf(today);
  const week = selectedWeek ?? currentWeek;
  const weekEnd = shiftDate(week, 6);

  return (
    <section className="meals groceries" aria-labelledby="meals-title">
      <header className="dashboard-heading grocery-heading"><h1 id="meals-title">Menú de l’Abril</h1></header>
      <div className="card">
        <div className="meal-week-controls">
          <button type="button" aria-label="Setmana anterior" onClick={() => setSelectedWeek(shiftDate(week, -7))}><ChevronLeft size={20} /></button>
          <p role="status">{weekFormat.formatRange(atMidnight(week), atMidnight(weekEnd))}</p>
          <button type="button" aria-label="Setmana següent" onClick={() => setSelectedWeek(shiftDate(week, 7))}><ChevronRight size={20} /></button>
          {week !== currentWeek && <button className="meal-current-week" type="button" onClick={() => setSelectedWeek(null)}>Aquesta setmana</button>}
        </div>
        <MealWeek key={week} week={week} today={today} />
      </div>
    </section>
  );
}
