import React, { useEffect, useState } from 'react';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { api } from './api.js';

const path = '/api/home/light';
const sessionMessage = 'Actualitza la pàgina per renovar la sessió.';

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

  return (
    <section aria-labelledby="home-title">
      <header className="dashboard-heading grocery-heading"><h1 id="home-title">Casa</h1></header>
      <section className="card home-device" aria-labelledby="light-title">
        <header className="card-header">
          <span className="dashboard-card-icon"><Lightbulb size={21} aria-hidden="true" /></span>
          <h2 id="light-title">Llum sofà</h2>
        </header>
        <p className="home-device-state" role="status">
          {light?.configured ? (light.on ? 'Encesa' : 'Apagada') : light ? 'Pendent de connectar amb Tuya.' : 'Estat desconegut'}
        </p>
        {message && <p className="agenda-message" role="status">{message}</p>}
        <div className="home-device-actions">
          {light?.configured && (
            <button type="button" className="home-device-power" disabled={busy} onClick={() => void updateLight(!light.on)}>
              {light.on ? 'Apaga' : 'Encén'}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => void updateLight()}>
            <RefreshCw size={17} aria-hidden="true" /> Actualitza l’estat
          </button>
        </div>
      </section>
    </section>
  );
}
