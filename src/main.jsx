import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, House, ListChecks, Menu, ShoppingBasket } from 'lucide-react';
import { dayKey, timeZone } from '../shared/dates.js';
import { Agenda } from './agenda.jsx';
import { Alerts } from './alerts.jsx';
import { GroceryList } from './groceries.jsx';
import { Tasks, TaskOverview } from './tasks.jsx';
import { Weather, useWeather } from './weather.jsx';
import { weatherAlerts } from './weather-alerts.js';
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
  { id: 'tasques', label: 'Tasques', icon: ListChecks },
];
const navigationPreference = 'family-board:hide-navigation';
// Use hash links within the installed shopping shortcut's /compra/ scope.
const shoppingEntry = ['/compra', '/compra/'].includes(window.location.pathname);

function currentPage() {
  const hash = window.location.hash.slice(1);
  const id = hash === 'calendario' ? 'calendari' : hash;
  if (pages.some((page) => page.id === id)) return id;
  return shoppingEntry ? 'compra' : 'avui';
}

function FamilyBoard() {
  const [now, setNow] = useState(() => new Date());
  const today = dayKey(now);
  const weather = useWeather(today);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    const interval = window.setInterval(updateClock, 15_000);
    document.addEventListener('visibilitychange', updateClock);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', updateClock);
    };
  }, []);

  return (
    <>
      <App now={now} today={today} weather={weather} />
      <Alerts alerts={weatherAlerts(weather, today)} />
    </>
  );
}

function App({ now, today, weather }) {
  const [page, setPage] = useState(currentPage);
  const [status, setStatus] = useState({ label: 'S’està comprovant la versió' });
  const [navigationHidden, setNavigationHidden] = useState(() => {
    try {
      return window.localStorage.getItem(navigationPreference) === 'true';
    } catch {
      return false;
    }
  });

  function toggleNavigation() {
    const hidden = !navigationHidden;
    setNavigationHidden(hidden);
    try {
      window.localStorage.setItem(navigationPreference, String(hidden));
    } catch {
      // The menu can still be toggled when storage is unavailable.
    }
  }

  useEffect(() => {
    const handleHash = () => setPage(currentPage());
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
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

  const navigationLabel = navigationHidden ? 'Mostra el menú' : 'Amaga el menú';

  return (
    <div className={navigationHidden ? 'dashboard dashboard-navigation-hidden' : 'dashboard'}>
      <header className="dashboard-navigation">
        <div className="dashboard-navigation-top">
          <button
            type="button"
            className="dashboard-navigation-toggle"
            aria-label={navigationLabel}
            aria-expanded={!navigationHidden}
            aria-controls="dashboard-links"
            title={navigationLabel}
            onClick={toggleNavigation}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <a className="brand" href="#avui">
            <span className="brand-icon"><House size={20} aria-hidden="true" /></span>
            Family Board
          </a>
        </div>
        <nav className="dashboard-links" id="dashboard-links" aria-label="Seccions">
          {pages.map(({ id, label, icon: Icon }) => (
            <a key={id} href={id === 'compra' && !shoppingEntry ? '/compra/' : `#${id}`} aria-current={page === id ? 'page' : undefined}>
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </header>

      <main className="dashboard-main">
        {page === 'compra' ? <GroceryList /> : page === 'tasques' ? <Tasks today={today} /> : (
          <>
            <header className="dashboard-heading">
              <div>
                <time dateTime={today} className="dashboard-date calendar-date">{date.format(now)}</time>
                <h1>{pages.find(({ id }) => id === page).label}</h1>
              </div>
              <time dateTime={now.toISOString()} className="dashboard-clock">{clock.format(now)}</time>
            </header>
            <div className="dashboard-content">
              <Agenda today={today} week={page === 'calendari'} />
              {page === 'avui' && <Weather weather={weather} today={today} />}
            </div>
            {page === 'avui' && <TaskOverview today={today} />}
          </>
        )}

        <footer className="dashboard-footer">
          <span role="status">{status.label}{status.commit && <> · <code>{status.commit}</code></>}</span>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<FamilyBoard />);
