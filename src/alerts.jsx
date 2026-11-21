import React, { useEffect, useRef, useState } from 'react';
import { Bell, CloudRain, Sun, ThermometerSnowflake } from 'lucide-react';

const storagePrefix = 'family-board:dismissed-alert:';
const icons = { cold: ThermometerSnowflake, heat: Sun, rain: CloudRain };

function readDismissedAlerts() {
  try {
    return Object.keys(window.localStorage)
      .filter((key) => key.startsWith(storagePrefix))
      .map((key) => key.slice(storagePrefix.length));
  } catch {
    return [];
  }
}

export function Alerts({ alerts }) {
  const dialog = useRef(null);
  const [dismissed, setDismissed] = useState(() => new Set(readDismissedAlerts()));
  const pending = alerts.filter(({ id }) => !dismissed.has(id));
  const hasPendingAlerts = pending.length > 0;

  useEffect(() => {
    function syncDismissal(event) {
      if (event.key?.startsWith(storagePrefix) && event.newValue === '1') {
        setDismissed((previous) => new Set([...previous, event.key.slice(storagePrefix.length)]));
      }
    }
    window.addEventListener('storage', syncDismissal);
    return () => window.removeEventListener('storage', syncDismissal);
  }, []);

  useEffect(() => {
    if (hasPendingAlerts && !dialog.current.open) dialog.current.showModal();
    if (!hasPendingAlerts && dialog.current.open) dialog.current.close();
  }, [hasPendingAlerts]);

  function dismiss() {
    const ids = pending.map(({ id }) => id);
    setDismissed((previous) => new Set([...previous, ...ids]));
    try {
      for (const id of ids) window.localStorage.setItem(storagePrefix + id, '1');
    } catch {
      // The in-memory state still dismisses the alerts when storage is unavailable.
    }
  }

  return (
    <dialog
      className="alerts-dialog"
      ref={dialog}
      aria-labelledby="alerts-title"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <h2 id="alerts-title">Avisos</h2>
      <ul className="alert-list">
        {pending.map(({ id, icon, title, detail }) => {
          const Icon = Object.hasOwn(icons, icon) ? icons[icon] : Bell;
          return (
            <li className="alert-item" key={id}>
              <span className="alert-icon"><Icon size={23} aria-hidden="true" /></span>
              <div>
                <h3>{title}</h3>
                {detail && <p>{detail}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      <button className="alert-dismiss" onClick={dismiss} type="button">Tanca</button>
    </dialog>
  );
}
