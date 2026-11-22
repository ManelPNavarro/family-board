import React, { useEffect, useState } from 'react';
import { Dumbbell, ListChecks } from 'lucide-react';
import { catalogEquipmentLabels, energyLevels, equipmentLabels, exerciseTarget, movementLabels, planWorkout } from '../shared/workouts.js';
import { api } from './api.js';

const workoutKey = 'family-board:current-workout';
const noEquipment = 'Sense material';

function readWorkout() {
  try {
    return JSON.parse(window.sessionStorage.getItem(workoutKey));
  } catch {
    return null;
  }
}

function WorkoutChecklist({ workout, onCheck }) {
  const { plan, checked } = workout;
  const total = plan.rounds * plan.sequence.length;
  return (
    <section className="card workout-plan" aria-labelledby="workout-plan-title">
      <header className="card-header">
        <span className="dashboard-card-icon"><ListChecks size={21} aria-hidden="true" /></span>
        <h2 id="workout-plan-title">El teu entrenament</h2>
      </header>
      <p className="workout-meta">Uns {plan.minutes} min · {plan.rest} s de descans orientatiu entre exercicis</p>
      <div className="workout-progress">
        <progress max={total} value={checked.length} aria-label="Progrés de l’entrenament" />
        <span role="status">{checked.length} / {total}</span>
      </div>
      {Array.from({ length: plan.rounds }, (_, round) => (
        <section className="workout-round" key={round} aria-labelledby={`workout-round-${round}`}>
          <h3 id={`workout-round-${round}`}>Ronda {round + 1}</h3>
          <ul className="grocery-items">
            {plan.sequence.map((exercise) => {
              const id = `${round}:${exercise.id}`;
              const complete = checked.includes(id);
              return (
                <li className={`grocery-item${complete ? ' grocery-item-checked' : ''}`} key={id}>
                  <label className="grocery-check workout-check">
                    <input type="checkbox" checked={complete} onChange={() => onCheck(id)} />
                    <span lang="en">{exercise.title}</span>
                    <small>{exerciseTarget(exercise)} · {exercise.equipment ? equipmentLabels[exercise.equipment] : noEquipment}</small>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}

export function Workouts() {
  const [exercises, setExercises] = useState(null);
  const [message, setMessage] = useState('S’està carregant el catàleg…');
  const [workout, setWorkout] = useState(readWorkout);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api('/api/workouts', { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setExercises(data.exercises);
        setMessage('');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setMessage(error.message === 'session'
          ? 'Actualitza la pàgina per renovar la sessió.'
          : 'No s’ha pogut carregar el catàleg.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!workout) return;
    try {
      window.sessionStorage.setItem(workoutKey, JSON.stringify(workout));
    } catch {
      // Progress remains available in memory when storage is unavailable.
    }
  }, [workout]);

  function generate(event) {
    event.preventDefault();
    if (!exercises) return;
    const data = new FormData(event.currentTarget);
    const movements = data.getAll('movement');
    if (!movements.length) {
      setNotice('Tria almenys un grup.');
      return;
    }
    const plan = planWorkout(exercises, {
      minutes: Number(data.get('minutes')),
      energy: data.get('energy'),
      movements,
      equipment: data.getAll('equipment'),
    });
    if (!plan.rounds) {
      setNotice('Amb aquest material, el catàleg encara no té exercicis per als grups triats.');
      return;
    }
    setNotice(plan.missing.length ? `Grups que han quedat fora del pla: ${plan.missing.map((key) => movementLabels[key]).join(', ')}.` : '');
    setWorkout({ plan, checked: [] });
  }

  function toggleExercise(id) {
    setWorkout((previous) => ({
      ...previous,
      checked: previous.checked.includes(id) ? previous.checked.filter((item) => item !== id) : [...previous.checked, id],
    }));
  }

  return (
    <section aria-labelledby="workouts-title">
      <header className="dashboard-heading grocery-heading"><h1 id="workouts-title">Entrenaments</h1></header>
      <div className="workout-layout">
        <section className="card" aria-labelledby="workout-setup-title">
          <header className="card-header">
            <span className="dashboard-card-icon"><Dumbbell size={21} aria-hidden="true" /></span>
            <h2 id="workout-setup-title">Prepara un entrenament</h2>
          </header>
          {message && <p className="agenda-message" role="status">{message}</p>}
          <form className="workout-form" onSubmit={generate}>
            <label>Quants minuts tens?
              <input type="number" name="minutes" min="1" max="120" step="1" defaultValue="15" required />
            </label>
            <fieldset>
              <legend>Què vols treballar?</legend>
              <div className="workout-options">
                {Object.entries(movementLabels).map(([id, label]) => (
                  <label key={id}><input type="checkbox" name="movement" value={id} />{label}</label>
                ))}
              </div>
            </fieldset>
            <label>Com vas d’energia?
              <select name="energy" defaultValue="medium">
                {Object.entries(energyLevels).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <fieldset>
              <legend>Quin material tens a mà?</legend>
              <div className="workout-options">
                {Object.entries(equipmentLabels).map(([id, label]) => (
                  <label key={id}><input type="checkbox" name="equipment" value={id} />{label}</label>
                ))}
              </div>
              <p className="workout-meta">Deixa-ho buit si vols entrenar sense material.</p>
            </fieldset>
            <button className="workout-generate" type="submit" disabled={!exercises}>Genera l’entrenament</button>
            {notice && <p className="agenda-message" role="status">{notice}</p>}
          </form>
        </section>
        {workout && <WorkoutChecklist workout={workout} onCheck={toggleExercise} />}
      </div>
      {exercises && (
        <details className="card workout-catalog">
          <summary>Catàleg d’exercicis ({exercises.length})</summary>
          <p className="workout-meta">Repeticions i durada orientatives per ronda</p>
          <ul className="workout-catalog-list">
            {exercises.map((exercise) => (
              <li key={exercise.id}>
                <strong lang="en">{exercise.title}</strong>
                <span>
                  {exerciseTarget(exercise)} · <span lang="en">{exercise.movement === 'legs' ? 'Legs' : movementLabels[exercise.movement]} · {exercise.equipment.map((id) => catalogEquipmentLabels[id]).join(' or ') || 'No equipment'}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
