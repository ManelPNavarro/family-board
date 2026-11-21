import React, { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { timeZone } from '../shared/dates.js';

const time = new Intl.DateTimeFormat('es-ES', {
  timeZone,
  hour: '2-digit',
  minute: '2-digit',
});
const headingDate = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const calendarMessages = {
  loading: 'Cargando el calendario familiar…',
  not_configured: 'Pendiente de conectar con Google Calendar.',
  unavailable: 'No se pudo cargar el calendario familiar. Se volverá a intentar automáticamente.',
  session: 'Actualiza la página para renovar la sesión.',
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
        <CalendarDays size={24} aria-hidden="true" />
        <h2 id="agenda">{week ? 'Próximos siete días' : 'Agenda de hoy'}</h2>
      </header>
      {calendar.status !== 'ready'
        ? <p className="agenda-message" role="status">{calendarMessages[calendar.status]}</p>
        : days.map(({ date, events }) => (
          <section className="agenda-day" key={date}>
            {week && <h3 className="capitalize">{headingDate.format(new Date(`${date}T00:00:00Z`))}</h3>}
            {events.length === 0
              ? <p className="agenda-message">Sin eventos.</p>
              : <ul>{events.map((event) => (
                <li key={event.id} className="event">
                  {event.start && !event.continues
                    ? <time dateTime={event.start}>{time.format(new Date(event.start))}</time>
                    : <span>{event.continues ? 'En curso' : 'Todo el día'}</span>}
                  <strong>{event.title}</strong>
                </li>
              ))}</ul>}
          </section>
        ))}
    </section>
  );
}
