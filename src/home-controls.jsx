import React, { useEffect, useState } from 'react';
import { ArrowRight, Lightbulb, LightbulbOff, Power, RefreshCw } from 'lucide-react';
import { api } from './api.js';

const path = '/api/home/light';
const sessionMessage = 'Actualitza la pàgina per renovar la sessió.';
const lightTitle = 'Llum sofà';

function getPowerState(light) {
  if (typeof light?.on !== 'boolean') return 'unknown';
  return light.on ? 'on' : 'off';
}

function LightStatus({ power }) {
  return (
    <p className="home-device-state" data-power={power} role="status">
      {power === 'on' ? 'Encesa' : power === 'off' ? 'Apagada' : 'Estat desconegut'}
    </p>
  );
}

export function HomeOverview() {
  const [light, setLight] = useState(null);

  useEffect(() => {
    let request;
    async function refresh() {
      if (document.visibilityState === 'hidden' || request) return;
      const controller = new AbortController();
      request = controller;
      try {
        const state = await api(path, { signal: controller.signal });
        if (!controller.signal.aborted) setLight(state);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLight(error.status === 502 ? { configured: true } : null);
        }
      } finally {
        request = null;
      }
    }

    void refresh();
    const interval = window.setInterval(refresh, 5 * 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      request?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  if (!light?.configured) return null;

  return (
    <section className="card home-overview" aria-labelledby="home-overview-title">
      <header className="card-header">
        <span className="dashboard-card-icon"><Lightbulb size={21} aria-hidden="true" /></span>
        <h2 id="home-overview-title">Casa</h2>
        <a className="agenda-link" href="#casa">Veure Casa <ArrowRight size={16} aria-hidden="true" /></a>
      </header>
      <ul className="home-overview-devices">
        <li>
          <strong>{lightTitle}</strong>
          <LightStatus power={getPowerState(light)} />
        </li>
      </ul>
    </section>
  );
}

export function HomeControls() {
  const [light, setLight] = useState(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('S’està consultant la bombeta…');

  useEffect(() => {
    const controller = new AbortController();
    api(path, { signal: controller.signal })
      .then((state) => {
        if (controller.signal.aborted) return;
        setLight(state);
        setMessage('');
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message === 'session' ? sessionMessage : 'No s’ha pogut consultar la bombeta.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, []);

  async function updateLight(on) {
    setBusy(true);
    setMessage('');
    let accepted = false;
    try {
      if (on !== undefined) {
        await api(path, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ on }),
        });
        accepted = true;
      }
      const state = await api(path);
      setLight(state);
      if (accepted && state.on !== on) setMessage('Ordre enviada. Actualitza l’estat per comprovar el canvi.');
    } catch (error) {
      setLight(null);
      if (error.message === 'session') setMessage(sessionMessage);
      else if (accepted) setMessage('Ordre enviada. No s’ha pogut confirmar el canvi.');
      else setMessage(on === undefined ? 'No s’ha pogut consultar la bombeta.' : 'No s’ha pogut confirmar l’ordre. Actualitza l’estat.');
    } finally {
      setBusy(false);
    }
  }

  const powerState = getPowerState(light);
  const BulbIcon = powerState === 'off' ? LightbulbOff : Lightbulb;

  return (
    <section aria-labelledby="home-title">
      <header className="dashboard-heading grocery-heading"><h1 id="home-title">Casa</h1></header>
      <section className="card home-device" aria-labelledby="light-title" data-power={powerState}>
        <header className="card-header home-device-header">
          <span className="dashboard-card-icon home-device-icon"><BulbIcon size={22} aria-hidden="true" /></span>
          <h2 id="light-title">{lightTitle}</h2>
          <LightStatus power={powerState} />
        </header>
        {light && !light.configured && <p className="agenda-message">Pendent de connectar amb Tuya.</p>}
        {message && <p className="agenda-message" role="status">{message}</p>}
        <div className="home-device-actions">
          {light?.configured && (
            <button type="button" className="home-device-power" disabled={busy} onClick={() => void updateLight(!light.on)}>
              <Power size={17} aria-hidden="true" />
              {light.on ? 'Apaga' : 'Encén'}
            </button>
          )}
          <button type="button" className="home-device-refresh" disabled={busy}
            aria-label="Actualitza l’estat" title="Actualitza l’estat" onClick={() => void updateLight()}>
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>
      </section>
    </section>
  );
}
