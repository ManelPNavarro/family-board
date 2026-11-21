import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { timeZone } from '../shared/dates.js';

const time = new Intl.DateTimeFormat('ca-ES', {
  timeZone,
  hour: '2-digit',
  minute: '2-digit',
});
const headingDate = new Intl.DateTimeFormat('ca-ES', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const calendarMessages = {
  loading: 'S’està carregant el calendari familiar…',
  not_configured: 'Pendent de connectar amb Google Calendar.',
  unavailable: 'No s’ha pogut carregar el calendari familiar. Es tornarà a provar automàticament.',
  session: 'Actualitza la pàgina per renovar la sessió.',
};

export function Agenda({ today, week }) {
  const [calendar, setCalendar] = useState({ status: 'loading' });

  useEffect(() => {
    if (import.meta.env.DEV) {
      setCalendar({ status: 'not_configured' });
      return;
    }

    let controller;
    async function refresh() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch('/api/calendar', {
          cache: 'no-store',
          redirect: 'manual',
          signal: request.signal,
        });
        if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403) {
          setCalendar({ status: 'session' });
          return;
        }

        const data = await response.json();
        if (request.signal.aborted) return;
        setCalendar(response.ok
          ? { status: 'ready', days: data.days }
          : { status: data.error === 'not_configured' ? 'not_configured' : 'unavailable' });
      } catch {
        if (!request.signal.aborted) setCalendar({ status: 'unavailable' });
      }
    }

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    void refresh();
    const interval = window.setInterval(refreshIfVisible, 5 * 60_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [today]);

  const days = calendar.days?.filter((day) => week || day.date === today) ?? [];

  return (
    <section className="card agenda" aria-labelledby="agenda">
      <header className="card-header">
        <span className="dashboard-card-icon"><CalendarDays size={21} aria-hidden="true" /></span>
        <h2 id="agenda">{week ? 'Pròxims set dies' : 'Agenda d’avui'}</h2>
        {!week && (
          <a className="agenda-link" href="#calendari">
            Veure setmana <ArrowRight size={16} aria-hidden="true" />
          </a>
        )}
      </header>
      {calendar.status !== 'ready'
        ? <p className="agenda-message" role="status">{calendarMessages[calendar.status]}</p>
        : days.length === 0 ? <p className="agenda-message">Sense esdeveniments.</p>
        : days.map(({ date, events }) => (
          <section className="agenda-day" key={date}>
            {week && <h3 className="calendar-date">{headingDate.format(new Date(`${date}T00:00:00Z`))}</h3>}
            {events.length === 0
              ? <p className="agenda-message">Sense esdeveniments.</p>
              : <ul>{events.map((event) => (
                <li key={event.id} className="event">
                  {event.start && !event.continues
                    ? <time dateTime={event.start}>{time.format(new Date(event.start))}</time>
                    : <span>{event.continues ? 'En curs' : 'Tot el dia'}</span>}
                  <strong>{event.title}</strong>
                </li>
              ))}</ul>}
          </section>
        ))}
    </section>
  );
}
