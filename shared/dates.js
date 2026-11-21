export const timeZone = 'Europe/Madrid';

const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone });
const offset = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' });

export function dayKey(instant) {
  return localDate.format(instant);
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
