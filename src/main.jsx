import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, House, ShoppingBasket } from 'lucide-react';
import { dayKey, timeZone } from '../shared/dates.js';
import { Agenda } from './agenda.jsx';
import './styles.css';

const clock = new Intl.DateTimeFormat('ca-ES', {
  timeZone,
  hour: '2-digit',
  minute: '2-digit',
});
const date = new Intl.DateTimeFormat('ca-ES', {
  timeZone,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const pages = [
  { id: 'avui', label: 'Avui', icon: House },
  { id: 'calendari', label: 'Calendari', icon: CalendarDays },
  { id: 'compra', label: 'Compra', icon: ShoppingBasket },
];
const sampleItems = ['Pa', 'Tomàquets', 'Iogurt natural', 'Pomes'];

function currentPage() {
  const hash = window.location.hash.slice(1);
  const id = hash === 'calendario' ? 'calendari' : hash;
  return pages.some((page) => page.id === id) ? id : 'avui';
}

function App() {
  const [now, setNow] = useState(() => new Date());
  const [page, setPage] = useState(currentPage);
  const [status, setStatus] = useState({ label: 'S’està comprovant la versió' });

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
          setStatus({ label: 'Actualitza la pàgina per renovar la sessió' });
          return;
        }
        if (!response.ok && response.status !== 503) throw new Error();
        const { commit, database } = await response.json();
        setStatus({
          label: database === 'ready' ? 'D1 connectat' : 'D1 no disponible',
          commit: commit?.slice(0, 7),
        });
      } catch {
        if (!controller.signal.aborted) setStatus({ label: 'Versió no disponible' });
      }
    }
    void loadStatus();
    return () => controller.abort();
  }, []);

  return (
    <main className="board">
      <header className="topbar">
        <a className="brand" href="#avui"><House size={22} aria-hidden="true" /> Family Board</a>
        <nav aria-label="Seccions">
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
          <p className="date calendar-date">{date.format(now)}</p>
          <h1>{pages.find(({ id }) => id === page).label}</h1>
        </div>
        <time dateTime={now.toISOString()} className="clock">{clock.format(now)}</time>
      </section>

      <div className={`panels ${page === 'avui' ? 'overview' : ''}`}>
        {page !== 'compra' && <Agenda today={dayKey(now)} week={page === 'calendari'} />}
        {page !== 'calendari' && (
          <section className="card groceries" aria-labelledby="groceries">
            <header className="card-header">
              <ShoppingBasket size={25} aria-hidden="true" />
              <h2 id="groceries">Llista de la compra</h2>
              <span className="sample-label">Exemple</span>
            </header>
            <ul>
              {sampleItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        )}
      </div>

      <footer className="footer">
        <span role="status">{status.label}{status.commit && <> · <code>{status.commit}</code></>}</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
