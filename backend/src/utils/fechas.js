/**
 * Fechas de calendario (sin corrimiento por zona horaria).
 * MySQL DATE / "YYYY-MM-DD" no deben pasarse por Date.toISOString() en UTC-6.
 */

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

/** Extrae YYYY-MM-DD de string, Date o valor MySQL. */
export function ymd(valor) {
  if (valor == null || valor === '') return '';
  if (typeof valor === 'string') {
    const m = valor.trim().match(YMD);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** dd/mm/yyyy (layout BASE GRAL / Contabilidad). */
export function formatFechaDMY(valor) {
  const iso = ymd(valor);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Primer y último día del mes en calendario local (sin toISOString). */
export function rangoMes(year, month) {
  const y = Number(year);
  const m = Number(month);
  const last = new Date(y, m, 0).getDate();
  return {
    fecha_desde: `${y}-${String(m).padStart(2, '0')}-01`,
    fecha_hasta: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

/**
 * Interpreta query de exportación: anio | mes | rango | completo.
 * @param {object} query
 * @param {{ defaultCompleto?: boolean }} [opts] si no hay params, ¿exportar todo? (REQ histórico)
 * @returns {{ modo: string, year: number, mes?: number, fecha_desde: string|null, fecha_hasta: string|null }}
 */
export function parsePeriodoExport(query = {}, opts = {}) {
  const now = new Date();
  const yIn = Number.parseInt(query.anio, 10);
  const year = Number.isInteger(yIn) && yIn >= 2000 ? yIn : now.getFullYear();
  const modoRaw = String(query.modo || query.periodo || '').toLowerCase();
  const tieneAlgo = !!(query.anio || query.mes || query.fecha_desde || query.fecha_hasta
    || query.modo || query.periodo || query.completo);

  const desdeQ = ymd(query.fecha_desde);
  const hastaQ = ymd(query.fecha_hasta);
  if (desdeQ && hastaQ) {
    return { modo: 'rango', year, fecha_desde: desdeQ, fecha_hasta: hastaQ };
  }

  if (query.completo === '1' || query.completo === 'true' || modoRaw === 'completo'
    || (!tieneAlgo && opts.defaultCompleto)) {
    return { modo: 'completo', year, fecha_desde: null, fecha_hasta: null };
  }

  const mesIn = Number.parseInt(query.mes, 10);
  if (modoRaw === 'mes' || modoRaw === 'mensual' || (Number.isInteger(mesIn) && mesIn >= 1 && mesIn <= 12 && modoRaw !== 'anual')) {
    const mes = Number.isInteger(mesIn) && mesIn >= 1 && mesIn <= 12 ? mesIn : (now.getMonth() + 1);
    return { modo: 'mes', year, mes, ...rangoMes(year, mes) };
  }

  return {
    modo: 'anio',
    year,
    fecha_desde: `${year}-01-01`,
    fecha_hasta: `${year}-12-31`,
  };
}

/** Fragmento SQL + params para filtrar una columna fecha por rango inclusivo. */
export function sqlRangoFecha(columna, fecha_desde, fecha_hasta) {
  if (fecha_desde && fecha_hasta) {
    return { sql: ` AND DATE(${columna}) BETWEEN ? AND ? `, params: [fecha_desde, fecha_hasta] };
  }
  if (fecha_desde) {
    return { sql: ` AND DATE(${columna}) >= ? `, params: [fecha_desde] };
  }
  if (fecha_hasta) {
    return { sql: ` AND DATE(${columna}) <= ? `, params: [fecha_hasta] };
  }
  return { sql: '', params: [] };
}
