/**
 * Extrae el número secuencial de un consecutivo en cualquier formato histórico.
 * Ej: REQ-2026S-001 → 1, 2026S-001 → 1, 001 → 1
 */
export function extraerNumeroConsecutivo(valor) {
  if (!valor) return 0;
  const s = String(valor).trim().replace(/^REQ-/i, '');
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split('-');
  const ultimo = parts[parts.length - 1];
  return parseInt(ultimo, 10) || 0;
}

/**
 * Calcula el siguiente consecutivo numérico (001, 002, …) a partir de valores existentes.
 */
export function siguienteConsecutivoNumerico(valores, digitos = 3) {
  let maxNum = 0;
  for (const valor of valores) {
    const n = extraerNumeroConsecutivo(valor);
    if (n > maxNum) maxNum = n;
  }
  return String(maxNum + 1).padStart(digitos, '0');
}

/** Letra de tipo para consecutivo: PARTES → P, SERVICIOS → S */
export function letraTipoConsecutivo(tipo) {
  return String(tipo || '').toUpperCase().startsWith('PART') ? 'P' : 'S';
}

/** Prefijo de consecutivo REQ: 2026S, 2026P, etc. */
export function prefijoConsecutivoReq(tipo, year = new Date().getFullYear()) {
  return `${year}${letraTipoConsecutivo(tipo)}`;
}

/**
 * Siguiente secuencia para un prefijo dado (ej. 2026S → 2026S-001, 2026S-002).
 * Solo considera consecutivos que coincidan con el prefijo.
 */
export function siguienteConsecutivoConPrefijo(valores, prefijo, digitos = 3) {
  const prefijoNorm = String(prefijo || '').toUpperCase();
  const patron = new RegExp(`^${prefijoNorm}-(\\d+)$`, 'i');
  let maxNum = 0;

  for (const valor of valores) {
    const s = String(valor || '').trim().replace(/^REQ-/i, '');
    const match = s.match(patron);
    if (match) {
      const n = parseInt(match[1], 10) || 0;
      if (n > maxNum) maxNum = n;
    }
  }

  return `${prefijoNorm}-${String(maxNum + 1).padStart(digitos, '0')}`;
}