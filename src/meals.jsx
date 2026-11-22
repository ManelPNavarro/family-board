import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { mondayOf, shiftDate } from '../shared/dates.js';
import { mealNotesLimit, mealTypes } from '../shared/meals.js';
import { api } from './api.js';

const endpoint = '/api/meals';
const mealLabels = { breakfast: 'Esmorzar', lunch: 'Dinar', dinner: 'Sopar' };
const dayFormat = new Intl.DateTimeFormat('ca-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekFormat = new Intl.DateTimeFormat('ca-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const atMidnight = (date) => new Date(`${date}T00:00:00Z`);
const mealKey = (date, meal) => `${date}:${meal}`;
const sessionMessage = 'Actualitza la pàgina per renovar la sessió.';

function MealWeek({ week, today }) {
  const [entries, setEntries] = useState(null);
  const [message, setMessage] = useState('S’està carregant el menú…');
  const [editor, setEditor] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  const dialog = useRef(null);
  const notesField = useRef(null);
  const dates = Array.from({ length: 7 }, (_, index) => shiftDate(week, index));

  useEffect(() => {
    async function refresh() {
      if (dialog.current.open) return;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      try {
        const { meals } = await api(`${endpoint}?week=${week}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setEntries(Object.fromEntries(meals.map(({ date, meal, notes }) => [mealKey(date, meal), notes])));
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

  function openEditor(date, meal) {
    setError('');
    setEditor({ date, meal });
    setNotes(entries[mealKey(date, meal)] ?? '');
    dialog.current.showModal();
    notesField.current.focus();
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    request.current?.abort();
    setBusy(true);
    setError('');
    try {
      const saved = await api(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editor, notes }),
      });
      setEntries((previous) => ({ ...previous, [mealKey(saved.date, saved.meal)]: saved.notes }));
      dialog.current?.close();
    } catch (failure) {
      setError(failure.message === 'session' ? sessionMessage : 'No s’ha pogut desar l’àpat. Torna-ho a provar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {message && <p className="agenda-message" role="status">{message}</p>}
      {entries && (
        <>
          <div className="meal-grid-row meal-grid-head" aria-hidden="true">
            <span>Dia</span>
            {mealTypes.map((meal) => <span key={meal}>{mealLabels[meal]}</span>)}
          </div>
          <ol className="meal-grid">
            {dates.map((date) => {
              const label = dayFormat.format(atMidnight(date));
              return (
                <li key={date} className="meal-grid-row" data-today={date === today || undefined}>
                  <h2><time dateTime={date} className="calendar-date">{label}</time>{date === today && <span>Avui</span>}</h2>
                  {mealTypes.map((meal) => {
                    const value = entries[mealKey(date, meal)];
                    return (
                      <button className="meal-cell" key={meal} type="button" aria-haspopup="dialog"
                        aria-label={`${mealLabels[meal]}, ${label}: ${value || 'Afegeix un àpat'}`}
                        disabled={message === sessionMessage} onClick={() => openEditor(date, meal)}>
                        <span className="meal-cell-label">{mealLabels[meal]}</span>
                        {value ? <span className="meal-cell-notes">{value}</span> :
                          <span className="meal-empty"><Plus size={15} aria-hidden="true" /> Afegeix un àpat</span>}
                      </button>
                    );
                  })}
                </li>
              );
            })}
          </ol>
        </>
      )}
      <dialog ref={dialog} className="grocery-dialog meal-dialog" aria-labelledby="meal-editor-title"
        onCancel={(event) => { if (busy) event.preventDefault(); }}>
        <header className="grocery-dialog-header">
          <h2 id="meal-editor-title">{editor ? mealLabels[editor.meal] : 'Àpat'}</h2>
          <button type="button" aria-label="Tanca" disabled={busy} onClick={() => dialog.current.close()}><X size={20} /></button>
        </header>
        <form onSubmit={save}>
          <label>
            {editor && <span className="calendar-date">{dayFormat.format(atMidnight(editor.date))}</span>}
            <textarea ref={notesField} value={notes} onChange={(event) => setNotes(event.target.value)}
              placeholder="Què li preparareu?" maxLength={mealNotesLimit} rows={4} disabled={busy} />
          </label>
          {error && <p role="alert" className="agenda-message">{error}</p>}
          <button type="submit" className="meal-save" disabled={busy}>Desa</button>
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
