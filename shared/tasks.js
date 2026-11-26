import { mondayOf, shiftDate, validDate } from './dates.js';
export { validDate as validDueDate } from './dates.js';

export const taskPriorities = ['low', 'normal', 'high'];
export const taskAssignees = { manel: 'Manel', marina: 'Marina' };
export const taskRecurrences = {
  none: 'Sense repetició',
  daily: 'Cada dia',
  weekly: 'Cada setmana',
  fortnightly: 'Cada dues setmanes',
  monthly: 'Cada mes',
};

const recurrenceIntervals = { daily: 1, weekly: 7, fortnightly: 14 };

export function nextTaskDate(dueDate, recurrence, recurrenceDay, today) {
  if (recurrence === 'none') return null;

  let next;
  if (recurrence === 'monthly') {
    const [year, month] = dueDate.split('-').map(Number);
    const [todayYear, todayMonth] = today.split('-').map(Number);
    const anchorDay = recurrenceDay ?? Number(dueDate.slice(8, 10));
    const nextMonth = Math.max(year * 12 + month, todayYear * 12 + todayMonth - 1);
    const dayOfMonth = (monthIndex) => {
      const targetYear = Math.floor(monthIndex / 12);
      const targetMonth = monthIndex % 12;
      const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      return new Date(Date.UTC(targetYear, targetMonth, Math.min(anchorDay, lastDay))).toISOString().slice(0, 10);
    };
    next = dayOfMonth(nextMonth);
    if (next <= today && validDate(next)) next = dayOfMonth(nextMonth + 1);
  } else {
    const interval = recurrenceIntervals[recurrence];
    const overdueDays = Math.max(0, (Date.parse(today) - Date.parse(dueDate)) / 86_400_000);
    next = shiftDate(dueDate, (Math.floor(overdueDays / interval) + 1) * interval);
  }
  return validDate(next) ? next : null;
}

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
