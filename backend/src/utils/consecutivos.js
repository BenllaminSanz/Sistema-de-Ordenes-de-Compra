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