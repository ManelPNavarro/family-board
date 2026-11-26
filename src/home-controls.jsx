import React, { useEffect, useState } from 'react';
import { ArrowRight, BatteryMedium, Bot, Lightbulb, LightbulbOff, Power, RefreshCw, Sparkles } from 'lucide-react';
import { api } from './api.js';

const path = '/api/home/light';
const scenesPath = `${path}/scenes`;
const sessionMessage = 'Actualitza la pàgina per renovar la sessió.';
const lightTitle = 'Llum sofà';

function getPowerState(light) {
  if (light?.online === false) return 'offline';
  if (typeof light?.on !== 'boolean') return 'unknown';
  return light.on ? 'on' : 'off';
}

const powerLabels = { on: 'Encesa', off: 'Apagada', offline: 'Sense connexió', unknown: 'Estat desconegut' };

function LightStatus({ power }) {
  return (
    <p className="home-device-state" data-power={power} role="status">
      {powerLabels[power]}
    </p>
  );
}

export function HomeOverview() {
  const [light, setLight] = useState(null);
  const [roborock, setRoborock] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api(roborockPath, { signal: controller.signal }).then((state) => {
      if (!controller.signal.aborted) setRoborock(state);
    }).catch((error) => {
      if (!controller.signal.aborted && error.status === 502) setRoborock({});
    });
    return () => controller.abort();
  }, []);

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

  if (!light?.configured && !roborock) return null;

  return (
    <section className="card home-overview" aria-labelledby="home-overview-title">
      <header className="card-header">
        <span className="dashboard-card-icon"><Lightbulb size={21} aria-hidden="true" /></span>
        <h2 id="home-overview-title">Casa</h2>
        <a className="agenda-link" href="#casa">Veure Casa <ArrowRight size={16} aria-hidden="true" /></a>
      </header>
      <ul className="home-overview-devices">
        {light?.configured && (
          <li>
            <strong>{lightTitle}</strong>
            <LightStatus power={getPowerState(light)} />
          </li>
        )}
        {roborock && (
          <li>
            <strong>Roborock</strong>
            <span className="home-device-state" data-online={roborock.online}>
              {getRoborockStatus(roborock)}{typeof roborock.battery === 'number' && ` · ${roborock.battery} %`}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}

const roborockPath = '/api/home/roborock';

// These are the cloud snapshot's state codes, separate from the Q7's live protocol.
const roborockStates = {
  3: 'En espera',
  5: 'Netejant',
  6: 'Tornant a la base',
  8: 'A la base',
  10: 'En pausa',
  12: 'Amb una incidència',
};

function getRoborockStatus(state) {
  if (state?.online === false) return 'Sense connexió';
  return roborockStates[state?.stateCode] ?? (state?.online === true ? 'En línia' : 'Estat desconegut');
}

const cleaningDate = new Intl.DateTimeFormat('ca-ES', {
  timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short',
});
const cleaningArea = new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 1 });

function RoborockHistory({ state }) {
  const cleanings = state.recentCleanings ?? (state.lastCleaning ? [state.lastCleaning] : []);

  return (
    <section className="roborock-history" aria-labelledby="roborock-history-title">
      <h3 id="roborock-history-title">Últimes neteges</h3>
      {cleanings.length > 0 && (
        <ol>
          {cleanings.map(({ startedAt, area }) => (
            <li key={startedAt}>
              <time dateTime={startedAt}>{cleaningDate.format(new Date(startedAt))}</time>
              {typeof area === 'number' && <span>{cleaningArea.format(area)} m²</span>}
            </li>
          ))}
        </ol>
      )}
      {state.historyError && <p className="agenda-message">No s’ha pogut consultar l’historial de neteges.</p>}
      {!state.historyError && cleanings.length === 0 && <p className="agenda-message">Encara no hi ha cap neteja registrada.</p>}
    </section>
  );
}

function RoborockCard() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    api(`${roborockPath}?history=1`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setState(result);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setState(null);
        if (failure.message === 'session') setError(sessionMessage);
        else if (failure.status === 503) setError('Pendent de connectar amb Roborock.');
        else setError('No s’han pogut consultar les dades del Roborock.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [refresh]);

  const battery = state?.battery;

  return (
    <section className="card home-device roborock-device" aria-labelledby="roborock-title">
      <header className="card-header home-device-header">
        <span className="dashboard-card-icon"><Bot size={22} aria-hidden="true" /></span>
        <h2 id="roborock-title">Roborock Q7 L5+</h2>
        <div className="home-device-actions roborock-actions">
          <button type="button" className="home-device-refresh" disabled={busy}
            aria-label="Actualitza l’estat del Roborock" title="Actualitza l’estat del Roborock"
            onClick={() => {
              setBusy(true);
              setError('');
              setRefresh((previous) => previous + 1);
            }}>
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div aria-live="polite" aria-busy={busy}>
        {state && (
          <div className="roborock-summary">
            <div className="roborock-battery">
              <span><BatteryMedium size={18} aria-hidden="true" /> Bateria</span>
              <strong>{typeof battery === 'number' ? `${battery} %` : '—'}</strong>
              {typeof battery === 'number' && <progress value={battery} max="100" aria-label="Bateria del Roborock" />}
            </div>
            <p className="home-device-state" data-online={state.online}>{getRoborockStatus(state)}</p>
          </div>
        )}
        {state && <RoborockHistory state={state} />}
        {error && <p className="agenda-message">{error}</p>}
      </div>
      {busy && !state && <p className="agenda-message" role="status">S’està consultant el Roborock…</p>}
    </section>
  );
}

export function HomeControls() {
  const [light, setLight] = useState(null);
  const [scenes, setScenes] = useState(null);
  const [scenesError, setScenesError] = useState(false);
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

  useEffect(() => {
    if (!light?.configured) return;
    const controller = new AbortController();
    api(scenesPath, { signal: controller.signal }).then(({ scenes }) => {
      if (!controller.signal.aborted) {
        setScenes(scenes);
        setScenesError(false);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setScenesError(true);
    });
    return () => controller.abort();
  }, [light?.configured]);

  async function updateLight(change) {
    setBusy(true);
    setMessage('');
    let accepted = false;
    try {
      if (change) {
        await api(change.scene ? scenesPath : path, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(change),
        });
        accepted = true;
      }
      const state = await api(path);
      setLight(state);
      if (accepted && state.on !== (change.on ?? true)) setMessage('Ordre enviada. Actualitza l’estat per comprovar el canvi.');
      else if (accepted && change.scene) setMessage('Escena enviada a la bombeta.');
    } catch (error) {
      let statusError = error;
      if (change && !accepted && error.message !== 'session') {
        try {
          const refreshed = await api(path);
          setLight(refreshed);
          if (refreshed.online !== false) {
            setMessage(change.scene ? 'No s’ha pogut aplicar l’escena. Torna-ho a provar.' : 'No s’ha pogut aplicar el canvi. Torna-ho a provar.');
          }
          return;
        } catch (failure) {
          statusError = failure;
        }
      }
      setLight((previous) => previous?.configured ? { configured: true } : previous);
      if (statusError.message === 'session') setMessage(sessionMessage);
      else setMessage(accepted ? 'Ordre enviada. No s’ha pogut confirmar el canvi.' : 'No s’ha pogut consultar la bombeta.');
    } finally {
      setBusy(false);
    }
  }

  const powerState = getPowerState(light);
  const BulbIcon = powerState === 'off' ? LightbulbOff : Lightbulb;

  return (
    <section className="home-page" aria-labelledby="home-title">
      <header className="dashboard-heading grocery-heading"><h1 id="home-title">Casa</h1></header>
      <div className="home-device-grid">
        <div className="home-light-column">
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
                <button type="button" className="home-device-power" disabled={busy || typeof light.on !== 'boolean'}
                  onClick={() => void updateLight({ on: !light.on })}>
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
          {light?.configured && (scenes || scenesError) && (
            <section className="card home-device home-scenes" aria-labelledby="scenes-title">
              <header className="card-header">
                <span className="dashboard-card-icon"><Sparkles size={21} aria-hidden="true" /></span>
                <h2 id="scenes-title">Escenes de llum</h2>
              </header>
              {scenes?.length ? (
                <div className="home-scene-grid">
                  {scenes.map(({ id, title, detail }) => (
                    <button type="button" key={id} disabled={busy || powerState === 'offline'} onClick={() => void updateLight({ scene: id })}>
                      <strong>{title}</strong>
                      <span>{detail}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="agenda-message">
                  {scenesError ? 'No s’han pogut carregar les escenes.' : 'Aquesta bombeta no ofereix els controls necessaris per a les escenes.'}
                </p>
              )}
            </section>
          )}
        </div>
        <RoborockCard />
      </div>
    </section>
  );
}
