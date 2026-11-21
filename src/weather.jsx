import React, { useEffect, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Droplets, Moon, Sun, Sunrise, Sunset } from 'lucide-react';

const temperature = new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 0 });

function describeWeather(code, isDay) {
  if (code === 0) return ['Cel serè', isDay ? Sun : Moon];
  if (code === 1 || code === 2) return ['Intervals de núvols', isDay ? CloudSun : CloudMoon];
  if (code === 3) return ['Cel cobert', Cloud];
  if (code === 45 || code === 48) return ['Boira', CloudFog];
  if ([51, 53, 55, 56, 57].includes(code)) return ['Plugim', CloudDrizzle];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['Pluja', CloudRain];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Neu', CloudSnow];
  if ([95, 96, 97, 99].includes(code)) return ['Tempesta', CloudLightning];
  return ['Estat del cel no disponible', Cloud];
}

const degrees = (value) => Number.isFinite(value) ? `${temperature.format(value)}°` : '—';

export function Weather({ today }) {
  const [weather, setWeather] = useState({ status: 'loading' });

  useEffect(() => {
    if (import.meta.env.DEV) return;

    let controller;
    async function refresh() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch('/api/weather', {
          cache: 'no-store',
          redirect: 'manual',
          signal: request.signal,
        });
        const data = await response.json();
        if (!request.signal.aborted) {
          setWeather(response.ok ? { status: 'ready', ...data } : { status: data.error });
        }
      } catch {
        if (!request.signal.aborted) setWeather({ status: 'unavailable' });
      }
    }

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    void refresh();
    const interval = window.setInterval(refreshIfVisible, 15 * 60_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      controller?.abort();
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.clearInterval(interval);
    };
  }, [today]);

  if (weather.status === 'not_configured' || weather.status === 'loading') return null;
  if (weather.status !== 'ready' || weather.date !== today) {
    return (
      <section className="card weather-card" aria-labelledby="weather-title">
        <h2 id="weather-title">El temps</h2>
        <p className="agenda-message">La previsió no està disponible ara mateix.</p>
      </section>
    );
  }

  const [description, Icon] = describeWeather(weather.weatherCode, weather.isDay);
  return (
    <section className="card weather-card" aria-labelledby="weather-title">
      <header>
        <h2 id="weather-title">El temps a {weather.location}</h2>
      </header>
      <div className="weather-summary">
        <div className="weather-current">
          <Icon size={32} aria-hidden="true" />
          <div>
            <strong>{degrees(weather.temperature)}</strong>
            <span className="weather-sky">{description}</span>
          </div>
          <span className="weather-range">Mín. {degrees(weather.minimum)} · Màx. {degrees(weather.maximum)}</span>
        </div>
        <dl className="weather-details">
          <div>
            <dt><Droplets size={17} aria-hidden="true" /> Prob. màx. de precipitació</dt>
            <dd>{weather.precipitation === null ? '—' : `${weather.precipitation} %`}</dd>
          </div>
          <div>
            <dt><Sunrise size={17} aria-hidden="true" /> Sortida del sol</dt>
            <dd>{weather.sunrise ?? '—'}</dd>
          </div>
          <div>
            <dt><Sunset size={17} aria-hidden="true" /> Posta del sol</dt>
            <dd>{weather.sunset ?? '—'}</dd>
          </div>
        </dl>
      </div>
      <footer className="weather-source">
        {weather.stale && <span>Últimes dades disponibles, de les {weather.measuredAt}. </span>}
        <a href="https://open-meteo.com/">Dades d’Open-Meteo</a>
      </footer>
    </section>
  );
}
