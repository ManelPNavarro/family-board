import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, School, X } from 'lucide-react';
import { mondayOf, shiftDate } from '../shared/dates.js';
import { mealNotesLimit, mealTypes } from '../shared/meals.js';
import { grocerySuggestions } from '../shared/grocery-suggestions.js';
import { api } from './api.js';

const endpoint = '/api/meals';
const mealLabels = { breakfast: 'Esmorzar', lunch: 'Dinar', dinner: 'Sopar' };
const courseLabels = ['Primer plat', 'Segon plat', 'Postres'];
const dayFormat = new Intl.DateTimeFormat('ca-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekFormat = new Intl.DateTimeFormat('ca-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const atMidnight = (date) => new Date(`${date}T00:00:00Z`);
const mealKey = (date, meal) => `${date}:${meal}`;
const sessionMessage = 'Actualitza la pàgina per renovar la sessió.';

function MealWeek({ week, today }) {
  const [entries, setEntries] = useState(null);
  const [message, setMessage] = useState('S’està carregant el menú…');
  const [editor, setEditor] = useState(null);
  const [courses, setCourses] = useState(['', '', '']);
  const [courseHistory, setCourseHistory] = useState([[], [], []]);
  const [step, setStep] = useState(0);
  const [school, setSchool] = useState(false);
  const [schoolLabel, setSchoolLabel] = useState('Escola');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  const dialog = useRef(null);
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
        setCourseHistory(data.courseHistory ?? [[], [], []]);
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
    const entry = entries[mealKey(date, meal)];
    setError('');
    setEditor({ date, meal });
    setCourses(entry?.courses ?? [entry?.notes ?? '', '', '']);
    setStep(0);
    setSchool(entry?.school === true);
    dialog.current.showModal();
    (entry?.school ? schoolField : notesField).current.focus();
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    if (!school && step < courseLabels.length - 1) {
      moveStep(step + 1);
      return;
    }
    request.current?.abort();
    setBusy(true);
    setError('');
    try {
      const saved = await api(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editor, courses, school }),
      });
      setEntries((previous) => ({ ...previous, [mealKey(saved.date, saved.meal)]: saved }));
      if (!saved.school) {
        setCourseHistory((previous) => previous.map((titles, index) =>
          saved.courses[index] ? [...new Set([saved.courses[index], ...titles])] : titles));
      }
      dialog.current?.close();
    } catch (failure) {
      setError(failure.message === 'session' ? sessionMessage : 'No s’ha pogut desar l’àpat. Torna-ho a provar.');
    } finally {
      setBusy(false);
    }
  }

  function moveStep(nextStep) {
    setStep(nextStep);
    notesField.current.focus();
  }

  function setCourse(value) {
    setCourses((previous) => previous.map((text, index) => index === step ? value : text));
  }

  const suggestions = school ? [] : grocerySuggestions(courses[step], courseHistory[step], []);

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
                    const entry = entries[mealKey(date, meal)];
                    const value = entry?.school ? schoolLabel : entry?.notes;
                    return (
                      <button className="meal-cell" data-school={entry?.school || undefined} key={meal} type="button" aria-haspopup="dialog"
                        aria-label={`${mealLabels[meal]}, ${label}: ${value || 'Afegeix un àpat'}`}
                        disabled={message === sessionMessage} onClick={() => openEditor(date, meal)}>
                        <span className="meal-cell-label">{mealLabels[meal]}</span>
                        {entry?.school ? <span className="meal-school"><School size={16} aria-hidden="true" />{schoolLabel}</span> :
                          entry?.courses?.some(Boolean) ? <span className="meal-course-summary">
                            {entry.courses.map((course, index) => course && (
                              <span key={courseLabels[index]} className="meal-cell-notes">
                                <small>{courseLabels[index]}</small>{course}
                              </span>
                            ))}
                          </span> : value ? <span className="meal-cell-notes">{value}</span> :
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
        onClose={() => setSchool(false)}
        onCancel={(event) => { if (busy) event.preventDefault(); }}>
        <header className="grocery-dialog-header">
          <h2 id="meal-editor-title">{editor ? mealLabels[editor.meal] : 'Àpat'}</h2>
          <button type="button" aria-label="Tanca" disabled={busy} onClick={() => dialog.current.close()}><X size={20} /></button>
        </header>
        <form onSubmit={save}>
          {editor && <p className="calendar-date">{dayFormat.format(atMidnight(editor.date))}</p>}
          <label className="meal-school-toggle">
            <input ref={schoolField} type="checkbox" checked={school} disabled={busy}
              onChange={(event) => setSchool(event.target.checked)} />
            {schoolLabel}
          </label>
          <div className="meal-course-step" hidden={school}>
            <label className="meal-course-label" htmlFor="meal-course">
              {courseLabels[step]} <span>{step + 1} / {courseLabels.length}</span>
            </label>
            <textarea id="meal-course" ref={notesField} value={courses[step]}
              onChange={(event) => setCourse(event.target.value)} placeholder="Escriu un plat"
              maxLength={mealNotesLimit} rows={3} disabled={busy || school} />
            {suggestions.length > 0 && (
              <ul className="grocery-suggestions" aria-label="Plats suggerits">
                {suggestions.map((title) => (
                  <li key={title}><button type="button" disabled={busy} onClick={() => {
                    setCourse(title);
                    notesField.current.focus();
                  }}>{title}</button></li>
                ))}
              </ul>
            )}
          </div>
          {error && <p role="alert" className="agenda-message">{error}</p>}
          <div className="meal-course-actions">
            {!school && step > 0 && <button type="button" disabled={busy} onClick={() => moveStep(step - 1)}>Enrere</button>}
            <button type="submit" className="meal-save" disabled={busy}>
              {school || step === courseLabels.length - 1 ? 'Desa' : 'Següent'}
            </button>
          </div>
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
