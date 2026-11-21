import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, House, ShoppingBasket } from 'lucide-react';
import './styles.css';

const clock = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  minute: '2-digit',
});
const date = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const pages = [
  { id: 'hoy', label: 'Hoy', icon: House },
  { id: 'calendario', label: 'Calendario', icon: CalendarDays },
  { id: 'compra', label: 'Compra', icon: ShoppingBasket },
];
const sampleEvents = [
  { time: '09:30', title: 'Desayuno en familia', category: 'En casa' },
  { time: '13:00', title: 'Paseo por el parque', category: 'Plan familiar' },
  { time: '18:00', title: 'Preparar la semana', category: 'En casa' },
];
const sampleItems = ['Pan', 'Tomates', 'Yogur natural', 'Manzanas'];

function currentPage() {
  const id = window.location.hash.slice(1);
  return pages.some((page) => page.id === id) ? id : 'hoy';
}

function App() {
  const [now, setNow] = useState(() => new Date());
  const [page, setPage] = useState(currentPage);
  const [status, setStatus] = useState({ label: 'Comprobando versión' });

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 15_000);
    const handleHash = () => setPage(currentPage());
    window.addEventListener('hashchange', handleHash);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('hashchange', handleHash);
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      setStatus({ label: 'Vista local' });
      return;
    }

    const controller = new AbortController();
    async function loadStatus() {
      try {
        const response = await fetch('/api/status', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.redirected || response.status === 401 || response.status === 403) {
          setStatus({ label: 'Actualiza la página para renovar la sesión' });
          return;
        }
        if (!response.ok && response.status !== 503) throw new Error();
        const { commit, database } = await response.json();
        setStatus({
          label: database === 'ready' ? 'D1 conectado' : 'D1 no disponible',
          commit: commit?.slice(0, 7),
        });
      } catch {
        if (!controller.signal.aborted) setStatus({ label: 'Versión no disponible' });
      }
    }
    void loadStatus();
    return () => controller.abort();
  }, []);

  return (
    <main className="board">
      <header className="topbar">
        <a className="brand" href="#hoy"><House size={22} aria-hidden="true" /> Family Board</a>
        <nav aria-label="Secciones">
          {pages.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`} aria-current={page === id ? 'page' : undefined}>
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </header>

      <section className="hero">
        <div>
          <p className="date capitalize">{date.format(now)}</p>
          <h1>{pages.find(({ id }) => id === page).label}</h1>
        </div>
        <time dateTime={now.toISOString()} className="clock">{clock.format(now)}</time>
      </section>

      <div className={`panels ${page === 'hoy' ? 'overview' : ''}`}>
        {page !== 'compra' && (
          <section className="card agenda" aria-labelledby="agenda">
            <header className="card-header">
              <CalendarDays size={24} aria-hidden="true" />
              <h2 id="agenda">Agenda de hoy</h2>
            </header>
            <ul>
              {sampleEvents.map(({ time, title, category }) => (
                <li key={time} className="event">
                  <time dateTime={time}>{time}</time>
                  <div><strong>{title}</strong><span>{category}</span></div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {page !== 'calendario' && (
          <section className="card groceries" aria-labelledby="groceries">
            <header className="card-header">
              <ShoppingBasket size={25} aria-hidden="true" />
              <h2 id="groceries">Lista de la compra</h2>
            </header>
            <ul>
              {sampleItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        )}
      </div>

      <footer className="footer">
        <span>Datos de ejemplo</span>
        <span role="status">{status.label}{status.commit && <> · <code>{status.commit}</code></>}</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
