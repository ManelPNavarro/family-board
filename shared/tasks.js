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
