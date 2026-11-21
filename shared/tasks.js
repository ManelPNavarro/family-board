export const taskPriorities = ['low', 'normal', 'high'];

export function validDueDate(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function compareTasks(a, b) {
  const priority = taskPriorities.indexOf(b.priority) - taskPriorities.indexOf(a.priority);
  return priority || (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99');
}

export function taskDates(today) {
  const day = new Date(`${today}T00:00:00Z`);
  const weekday = (day.getUTCDay() + 6) % 7;
  const dateAt = (offset) => new Date(day.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  return { tomorrow: dateAt(1), weekStart: dateAt(-weekday), weekEnd: dateAt(6 - weekday) };
}

export function taskPeriods(tasks, today) {
  const { weekStart, weekEnd } = taskDates(today);
  const week = tasks.filter(({ completed, dueDate }) =>
    !completed && dueDate && dueDate >= weekStart && dueDate <= weekEnd).sort(compareTasks);
  return { today: week.filter(({ dueDate }) => dueDate === today), week };
}
