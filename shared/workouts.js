export const movementLabels = { push: 'Push', pull: 'Pull', core: 'Core', legs: 'Cames' };
export const equipmentLabels = {
  bands: 'Bandes elàstiques',
  'dumbbell-5': 'Manuelles de 5 kg',
  'dumbbell-12': 'Manuelles de 12 kg',
  'pull-up-bar': 'Barra de dominades',
  bench: 'Banc o cadira estable',
};
export const catalogEquipmentLabels = {
  bands: 'Resistance bands',
  'dumbbell-5': '5 kg dumbbells',
  'dumbbell-12': '12 kg dumbbells',
  'pull-up-bar': 'Pull-up bar',
  bench: 'Bench or stable chair',
};
export const energyLevels = {
  low: { label: 'Baixa', work: 20, rounds: 2 },
  medium: { label: 'Mitjana', work: 30, rounds: 3 },
  high: { label: 'Alta', work: 40, rounds: 4 },
};

const timedExercises = {
  plank: { seconds: 60, sides: 1 },
  'side-plank': { seconds: 30, sides: 2 },
};

export function exerciseTarget({ id, movement }) {
  const timed = timedExercises[id];
  if (timed) return `${timed.seconds} segons${timed.sides === 2 ? ' per costat' : ''}`;
  if (id === 'pull-up' || id === 'chin-up') return '5 repeticions';
  return movement === 'core' ? '20 repeticions' : '15 repeticions';
}

export function planWorkout(exercises, { minutes, movements, energy, equipment }) {
  const profile = energyLevels[energy];
  const rest = 60 - profile.work;
  const budget = minutes * 60;
  const groups = movements.map((movement) => exercises.flatMap((exercise) => {
    if (exercise.movement !== movement) return [];
    const available = exercise.equipment.find((option) => equipment.includes(option));
    return !exercise.equipment.length || available ? [{ ...exercise, equipment: available ?? null }] : [];
  }));
  const sequence = [];
  let roundSeconds = 0;
  for (let index = 0; groups.some((group) => index < group.length) && roundSeconds < budget; index += 1) {
    for (const group of groups) {
      const exercise = group[index];
      if (!exercise) continue;
      const timed = timedExercises[exercise.id];
      const seconds = (timed ? timed.seconds * timed.sides : profile.work) + rest;
      if (roundSeconds + seconds > budget) continue;
      sequence.push(exercise);
      roundSeconds += seconds;
    }
  }
  const rounds = roundSeconds ? Math.min(profile.rounds, Math.floor(budget / roundSeconds)) : 0;
  const missing = movements.filter((movement) => !sequence.some((exercise) => exercise.movement === movement));
  return { sequence, missing, rounds, minutes: Math.ceil(rounds * roundSeconds / 60), work: profile.work, rest };
}
