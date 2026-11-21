const degrees = new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 1 });

export function weatherAlerts(weather, today) {
  if (weather.status !== 'ready' || weather.date !== today || weather.stale) return [];

  const alerts = [];
  if (Number.isFinite(weather.temperature)) {
    const detail = `Ara fa ${degrees.format(weather.temperature)} °C.`;
    if (weather.temperature <= 12) {
      alerts.push({ id: `weather:cold:${today}`, icon: 'cold', title: 'Abrigar l’Abril', detail });
    }
    if (weather.temperature >= 30) {
      alerts.push({ id: `weather:heat:${today}`, icon: 'heat', title: 'Molta calor', detail });
    }
  }
  if (Number.isFinite(weather.precipitation) && weather.precipitation >= 70) {
    alerts.push({
      id: `weather:rain:${today}`,
      icon: 'rain',
      title: 'Agafar paraigües',
      detail: `Avui hi ha fins a un ${weather.precipitation} % de probabilitat de precipitació.`,
    });
  }
  return alerts;
}
