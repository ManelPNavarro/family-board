import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, ListChecks, Pencil, Plus, Repeat2, Trash2, UserRound, X } from 'lucide-react';
import { compareTasks, taskAssignees, taskDates, taskPeriods, taskPriorities, taskRecurrences, validDueDate } from '../shared/tasks.js';
import { api } from './api.js';

const path = '/api/tasks';
const priorities = { low: 'Baixa', normal: 'Normal', high: 'Alta' };
const messages = {
  loading: 'S’estan carregant les tasques…',
  session: 'Actualitza la pàgina per renovar la sessió.',
  unavailable: 'No s’han pogut carregar les tasques. Es tornarà a provar automàticament.',
  save: 'No s’ha pogut desar el canvi. Torna-ho a provar.',
  remove: 'No s’ha pogut eliminar la tasca. Torna-ho a provar.',
};
const dueDateFormat = new Intl.DateTimeFormat('ca-ES', { timeZone: 'UTC', dateStyle: 'medium' });

function TaskPriority({ priority }) {
  return <span className={`task-priority task-priority-${priority}`}>Prioritat {priorities[priority].toLowerCase()}</span>;
}

function TaskDate({ date }) {
  return <time dateTime={date}>{dueDateFormat.format(new Date(`${date}T00:00:00Z`))}</time>;
}

function TaskAssignee({ assignee }) {
  if (!assignee) return null;
  return <span className="task-assignee"><UserRound size={14} aria-hidden="true" /> {taskAssignees[assignee]}</span>;
}

export function TaskOverview({ today }) {
  const { tasks, message } = useTasks();
  const periods = taskPeriods(tasks ?? [], today);
  const sections = [
    { id: 'today', title: 'Tasques avui' },
    { id: 'week', title: 'Tasques setmana' },
  ].filter(({ id }) => periods[id].length);
  if (message || !sections.length) return null;

  return (
    <div className="dashboard-task-grid">
      {sections.map(({ id, title }) => (
        <section className="card task-overview" key={id} aria-labelledby={`task-overview-${id}`}>
          <header className="card-header">
            <span className="dashboard-card-icon"><ListChecks size={21} aria-hidden="true" /></span>
            <h2 id={`task-overview-${id}`}><a href="#tasques">{title} <ArrowRight size={16} aria-hidden="true" /></a></h2>
          </header>
          <ul className="task-overview-list">
            {periods[id].map((task) => (
              <li key={task.id}>
                <strong>{task.title}</strong>
                <div className="task-details">
                  <TaskPriority priority={task.priority} />
                  <TaskAssignee assignee={task.assignee} />
                  {id === 'week' && <span className="task-due"><TaskDate date={task.dueDate} /></span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TaskGroup({ entries, id, heading, today, enabled, onEdit, onToggle }) {
  return (
    <section className="grocery-group" aria-labelledby={id}>
      <h2 id={id}>{heading} <span>{entries.length}</span></h2>
      <ul className="grocery-items" aria-labelledby={id}>
        {entries.map((task) => (
          <li className={`grocery-item task-item${task.completed ? ' grocery-item-checked' : ''}`} key={task.id}>
            <label className="grocery-check task-check">
              <input type="checkbox" checked={task.completed} disabled={!enabled}
                aria-label={task.completed ? `Reobre ${task.title}` : `Completa ${task.title}`}
                onChange={(event) => onToggle(task.id, event.target.checked)} />
              <span className="task-summary">
                <span className="task-title">{task.title}</span>
                <span className="task-details">
                  <TaskPriority priority={task.priority} />
                  <TaskAssignee assignee={task.assignee} />
                  {task.dueDate && (
                    <span className="task-due">
                      <CalendarDays size={15} aria-hidden="true" />
                      {!task.completed && task.dueDate < today ? 'Vençuda · ' : ''}
                      <TaskDate date={task.dueDate} />
                    </span>
                  )}
                  {task.recurrence && task.recurrence !== 'none' && (
                    <span className="task-recurrence">
                      <Repeat2 size={15} aria-hidden="true" /> {taskRecurrences[task.recurrence]}
                    </span>
                  )}
                </span>
              </span>
            </label>
            <div className="grocery-actions">
              <button type="button" disabled={!enabled} aria-label={`Edita ${task.title}`}
                onClick={() => onEdit(task)}><Pencil size={17} aria-hidden="true" /></button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function useTasks() {
  const [tasks, setTasks] = useState(null);
  const [message, setMessage] = useState('loading');
  const [saveError, setSaveError] = useState(false);
  const [nextDate, setNextDate] = useState(null);
  const [busy, setBusy] = useState(false);
  const refreshRequest = useRef(null);
  const saving = useRef(false);
  const mounted = useRef(false);

  async function refresh() {
    if (saving.current) return;
    refreshRequest.current?.abort();
    const request = new AbortController();
    refreshRequest.current = request;
    try {
      const data = await api(path, { signal: request.signal });
      if (!request.signal.aborted) {
        setTasks(data.tasks);
        setMessage('');
      }
    } catch (error) {
      if (!request.signal.aborted) setMessage(error.message === 'session' ? 'session' : 'unavailable');
    }
  }

  useEffect(() => {
    mounted.current = true;
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    const interval = window.setInterval(refreshIfVisible, 15_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      mounted.current = false;
      refreshRequest.current?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, []);

  async function save(method, id, fields) {
    if (saving.current) return false;
    saving.current = true;
    refreshRequest.current?.abort();
    setBusy(true);
    setSaveError(false);
    setNextDate(null);
    try {
      const data = await api(method === 'POST' ? path : `${path}/${id}`, {
        method,
        ...(fields && {
          body: JSON.stringify(fields),
          headers: { 'Content-Type': 'application/json' },
        }),
      });
      setTasks((previous) => {
        if (method === 'DELETE') return previous.filter((item) => item.id !== id);
        const { task, nextTask } = data;
        const updated = previous.some((item) => item.id === task.id)
          ? previous.map((item) => item.id === task.id ? task : item)
          : [...previous, task];
        return nextTask ? [...updated, nextTask] : updated;
      });
      if (data?.nextTask) setNextDate(data.nextTask.dueDate);
      return true;
    } catch (error) {
      if (error.message === 'session') setMessage('session');
      else setSaveError(method === 'DELETE' ? 'remove' : 'save');
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
      if (mounted.current) void refresh();
    }
  }

  return { tasks, message, saveError, setSaveError, nextDate, busy, saving, save };
}

export function Tasks({ today }) {
  const { tasks, message, saveError, setSaveError, nextDate, busy, saving, save } = useTasks();
  const [editor, setEditor] = useState(null);
  const [dueDate, setDueDate] = useState('');
  const [recurrence, setRecurrence] = useState('none');
  const dialog = useRef(null);
  const nameInput = useRef(null);
  const form = useRef(null);
  const { tomorrow, weekEnd } = taskDates(today);

  function openEditor(task) {
    setSaveError(false);
    setEditor({ task, id: task?.id ?? crypto.randomUUID() });
    form.current.elements.title.value = task?.title ?? '';
    setDueDate(task?.dueDate ?? '');
    setRecurrence(task?.recurrence ?? 'none');
    form.current.elements.assignee.value = task?.assignee ?? '';
    form.current.elements.priority.value = task?.priority ?? 'normal';
    dialog.current.showModal();
    nameInput.current.focus();
  }

  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = data.get('title').trim();
    const dueDate = data.get('dueDate') || null;
    const priority = data.get('priority');
    const assignee = data.get('assignee') || null;
    if (!title) {
      nameInput.current.setCustomValidity('Escriu el nom de la tasca.');
      nameInput.current.reportValidity();
      return;
    }
    if (dueDate && !validDueDate(dueDate)) return;

    const values = { title, dueDate, priority, recurrence, assignee };
    if (editor.task) {
      const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => editor.task[key] !== value));
      if (Object.keys(changes).length && !await save('PATCH', editor.id, changes)) return;
    } else if (!await save('POST', editor.id, { id: editor.id, ...values })) {
      return;
    }
    dialog.current?.close();
  }

  async function removeTask() {
    if (!window.confirm(`Vols eliminar «${editor.task.title}» definitivament?`)) return;
    if (await save('DELETE', editor.id)) dialog.current?.close();
  }

  const enabled = tasks !== null && message !== 'session' && !busy;
  const pending = tasks?.filter((task) => !task.completed).sort(compareTasks) ?? [];
  const completed = tasks?.filter((task) => task.completed) ?? [];
  const error = messages[saveError || message];

  return (
    <section className="groceries tasks" aria-labelledby="tasks-title">
      <header className="dashboard-heading grocery-heading">
        <h1 id="tasks-title">Tasques</h1>
        <button type="button" className="grocery-add-trigger task-add-trigger" aria-haspopup="dialog"
          aria-label="Nova tasca" disabled={!enabled} onClick={() => openEditor()}>
          <Plus size={23} aria-hidden="true" /> <span>Nova tasca</span>
        </button>
      </header>
      <div className="card">
        {!editor && error && <p className="agenda-message" role="status">{error}</p>}
        {!editor && !error && nextDate && (
          <p className="agenda-message" role="status">Tasca completada. Següent repetició el <TaskDate date={nextDate} />.</p>
        )}
        {tasks && pending.length === 0 && (
          <p className="grocery-empty">{completed.length ? 'Ja ho heu fet tot.' : 'Encara no hi ha cap tasca.'}</p>
        )}
        {pending.length > 0 && (
          <TaskGroup entries={pending} id="pending-tasks" heading="Pendents" today={today}
            enabled={enabled} onEdit={openEditor} onToggle={(id, checked) => void save('PATCH', id, { completed: checked })} />
        )}
        {completed.length > 0 && (
          <TaskGroup entries={completed} id="completed-tasks" heading="Fetes" today={today}
            enabled={enabled} onEdit={openEditor} onToggle={(id, checked) => void save('PATCH', id, { completed: checked })} />
        )}
      </div>
      <dialog className="grocery-dialog" ref={dialog} aria-labelledby="task-editor-title"
        onCancel={(event) => { if (saving.current) event.preventDefault(); }}
        onClose={() => {
          setEditor(null);
          setSaveError(false);
          nameInput.current.setCustomValidity('');
        }}>
        <header className="grocery-dialog-header">
          <h2 id="task-editor-title">{editor?.task ? 'Edita la tasca' : 'Nova tasca'}</h2>
          <button type="button" aria-label="Tanca" disabled={busy} onClick={() => dialog.current.close()}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <form className="task-form" ref={form} onSubmit={submit}>
          <label className="task-form-title">Nom de la tasca
            <input ref={nameInput} name="title" type="text" maxLength={120} required disabled={busy}
              onInput={(event) => event.currentTarget.setCustomValidity('')} />
          </label>
          <div className="task-form-date">
            <label>Data límit
              <input name="dueDate" type="date" min="1000-01-01" max="9999-12-31" disabled={busy}
                required={recurrence !== 'none'} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
            <div className="task-date-shortcuts" role="group" aria-label="Dates ràpides">
              {[
                { label: 'Avui', date: today },
                { label: 'Demà', date: tomorrow },
                { label: 'Aquesta setmana', date: weekEnd },
              ].map(({ label, date }) => (
                <button type="button" key={label} disabled={busy} aria-pressed={dueDate === date}
                  onClick={() => setDueDate(date)}>{label}</button>
              ))}
            </div>
          </div>
          <label>Prioritat
            <select name="priority" defaultValue="normal" disabled={busy}>
              {taskPriorities.map((priority) => <option key={priority} value={priority}>{priorities[priority]}</option>)}
            </select>
          </label>
          <label>Repetició
            <select name="recurrence" value={recurrence} onChange={(event) => setRecurrence(event.target.value)} disabled={busy}>
              {Object.entries(taskRecurrences).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Responsable
            <select name="assignee" defaultValue="" disabled={busy}>
              <option value="">Sense assignar</option>
              {Object.entries(taskAssignees).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="submit" className="task-save" disabled={!enabled}>Desa</button>
          {editor?.task && (
            <button type="button" className="task-delete" disabled={!enabled} onClick={removeTask}>
              <Trash2 size={17} aria-hidden="true" /> Elimina la tasca
            </button>
          )}
        </form>
        {editor && error && <p className="agenda-message" role="status">{error}</p>}
      </dialog>
    </section>
  );
}
