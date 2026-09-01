/** Días ISO 1=lunes … 7=domingo. Por defecto lunes a viernes. */
export const DIAS_REPORTE_DEFAULT = [1, 2, 3, 4, 5];

export function parseDiasReporte(raw) {
  const nums = String(Array.isArray(raw) ? raw.join(',') : raw || '')
    .split(/[,;\s]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => n >= 1 && n <= 7);
  return nums.length ? [...new Set(nums)].sort((a, b) => a - b) : [...DIAS_REPORTE_DEFAULT];
}

export function serializarDiasReporte(dias) {
  return parseDiasReporte(Array.isArray(dias) ? dias.join(',') : dias).join(',');
}

/** 1 = lunes … 7 = domingo (zona America/Mexico_City). */
export function diaSemanaMexico(date = new Date()) {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    weekday: 'short',
  }).format(date);
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[s] || 1;
}

export function esDiaDeReporteDiario(ajustes, date = new Date()) {
  const dias = parseDiasReporte(ajustes?.reporte_diario_dias);
  return dias.includes(diaSemanaMexico(date));
}
