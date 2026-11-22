export const movementLabels = { push: 'Push', pull: 'Pull', core: 'Core', legs: 'Cames' };
export const equipmentLabels = {
  bands: 'Bandes elàstiques',
  'dumbbell-5': 'Manuelles de 5 kg',
  'dumbbell-12': 'Manuelles de 12 kg',
  'pull-up-bar': 'Barra de dominades',
};
export const energyLevels = {
  low: { label: 'Baixa', work: 20, rounds: 2 },
  medium: { label: 'Mitjana', work: 30, rounds: 3 },
  high: { label: 'Alta', work: 40, rounds: 4 },
};

export function planWorkout(exercises, { minutes, movements, energy, equipment }) {
  const profile = energyLevels[energy];
  const groups = movements.map((movement) => exercises.flatMap((exercise) => {
    if (exercise.movement !== movement) return [];
    const available = exercise.equipment.find((option) => equipment.includes(option));
    return !exercise.equipment.length || available ? [{ ...exercise, equipment: available ?? null }] : [];
  }));
  const sequence = [];
  for (let index = 0; groups.some((group) => index < group.length) && sequence.length < minutes; index += 1) {
    for (const group of groups) {
      if (group[index] && sequence.length < minutes) sequence.push(group[index]);
    }
  }
  const rounds = sequence.length ? Math.min(profile.rounds, Math.floor(minutes / sequence.length)) : 0;
  const missing = movements.filter((movement) => !sequence.some((exercise) => exercise.movement === movement));
  return { sequence, missing, rounds, minutes: rounds * sequence.length, work: profile.work, rest: 60 - profile.work };
}
