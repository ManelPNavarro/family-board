export const timeZone = 'Europe/Madrid';

const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone });
const offset = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' });

export function dayKey(instant) {
  return localDate.format(instant);
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftDate(date, days) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

export function mondayOf(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((weekday + 6) % 7));
}

export function calendarDays(instant, count) {
  const firstDay = new Date(`${dayKey(instant)}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(firstDay);
    day.setUTCDate(day.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    // In Madrid the clock changes after midnight, so this offset is the one at local midnight.
    const zone = offset.formatToParts(day).find(({ type }) => type === 'timeZoneName');
    return { date, start: `${date}T00:00:00${zone.value.slice(3)}` };
  });
}
