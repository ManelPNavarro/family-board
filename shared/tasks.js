import { mondayOf, shiftDate } from './dates.js';
export { validDate as validDueDate } from './dates.js';

export const taskPriorities = ['low', 'normal', 'high'];

export function compareTasks(a, b) {
  const priority = taskPriorities.indexOf(b.priority) - taskPriorities.indexOf(a.priority);
  return priority || (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99');
}

export function taskDates(today) {
  const weekStart = mondayOf(today);
  return { tomorrow: shiftDate(today, 1), weekStart, weekEnd: shiftDate(weekStart, 6) };
}

export function taskPeriods(tasks, today) {
  const { weekStart, weekEnd } = taskDates(today);
  const week = tasks.filter(({ completed, dueDate }) =>
    !completed && dueDate && dueDate >= weekStart && dueDate <= weekEnd).sort(compareTasks);
  return { today: week.filter(({ dueDate }) => dueDate === today), week };
}
