const presets = [
  { id: 'vespre', title: 'Vespre', brightness: 35, temperature: 0.18, tone: 'Blanc càlid' },
  { id: 'llegir', title: 'Llegir', brightness: 80, temperature: 0.5, tone: 'Blanc neutre' },
  { id: 'peli', title: 'Peli', brightness: 10, temperature: 0, tone: 'Blanc molt càlid' },
  { id: 'cita', title: 'Cita', brightness: 20, temperature: 0, tone: 'Blanc molt càlid', amber: true },
];

function readValues(entry) {
  if (!entry) return {};
  try {
    return JSON.parse(entry.values) ?? {};
  } catch {
    return {};
  }
}

function integerControl(functions, code) {
  for (const candidate of [`${code}_v2`, code]) {
    const entry = functions.find((item) => item?.code === candidate && item.type === 'Integer');
    if (!entry) continue;
    const { min, max, step = 1 } = readValues(entry);
    if ([min, max, step].every(Number.isSafeInteger) && min >= 0 && max > min && step > 0 && step <= max - min) {
      return { code: candidate, min, max, step };
    }
  }
  return null;
}

function integerCommand({ code, min, max, step }, target) {
  const steps = Math.max(0, Math.min(Math.floor((max - min) / step), Math.round((target - min) / step)));
  return { code, value: min + steps * step };
}

export function lightScenes(functions, switchCode) {
  if (!Array.isArray(functions)) return [];
  const mode = functions.find((item) => item?.code === 'work_mode' && item.type === 'Enum');
  const { range } = readValues(mode);
  const modes = Array.isArray(range) ? range : [];
  const brightness = integerControl(functions, 'bright_value');
  const temperature = integerControl(functions, 'temp_value');
  const color = ['colour_data_v2', 'colour_data'].find((code) =>
    functions.some((item) => item?.code === code && String(item.type).toLowerCase() === 'json'));
  const colorMode = ['colour', 'color'].find((candidate) => modes.includes(candidate));
  const canDimWhite = brightness && (!mode || modes.includes('white'));
  const turnOn = { code: switchCode, value: true };

  return presets.flatMap(({ id, title, brightness: level, temperature: warmth, tone, amber }) => {
    if (amber && color && colorMode) {
      const scale = color === 'colour_data_v2' ? 1000 : 255;
      return [{
        id, title, detail: `Ambre · ${level} %`,
        commands: [
          turnOn,
          { code: 'work_mode', value: colorMode },
          { code: color, value: { h: 38, s: Math.round(scale * 0.8), v: Math.round(scale * level / 100) } },
        ],
      }];
    }
    if (!canDimWhite) return [];
    return [{
      id, title, detail: temperature ? `${tone} · ${level} %` : `Brillantor · ${level} %`,
      commands: [
        turnOn,
        ...(mode ? [{ code: 'work_mode', value: 'white' }] : []),
        ...(temperature ? [integerCommand(temperature, temperature.min + (temperature.max - temperature.min) * warmth)] : []),
        integerCommand(brightness, brightness.max * level / 100),
      ],
    }];
  });
}
