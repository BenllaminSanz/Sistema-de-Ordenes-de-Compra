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

/** Letra de tipo para consecutivo: PARTES → P, SERVICIOS → S, FLETES → F */
const LETRA_POR_TIPO = { PARTES: 'P', SERVICIOS: 'S', FLETES: 'F' };

export function letraTipoConsecutivo(tipo) {
  const letra = LETRA_POR_TIPO[String(tipo || '').toUpperCase()];
  if (!letra) throw new Error(`Tipo de requerimiento no soportado para consecutivo: "${tipo}"`);
  return letra;
}

/**
 * Obtiene el siguiente consecutivo para (año, tipo) usando la tabla de control
 * `consecutivos_control`, con lock de fila (SELECT ... FOR UPDATE) para evitar
 * duplicados ante creaciones concurrentes. Debe llamarse dentro de una transacción.
 */
export async function obtenerSiguienteConsecutivo(conn, tipo, anio = new Date().getFullYear()) {
  const letra = letraTipoConsecutivo(tipo);

  await conn.query(
    'INSERT IGNORE INTO consecutivos_control (anio, tipo, ultimo_numero) VALUES (?, ?, 0)',
    [anio, tipo]
  );
  const [[row]] = await conn.query(
    'SELECT ultimo_numero FROM consecutivos_control WHERE anio = ? AND tipo = ? FOR UPDATE',
    [anio, tipo]
  );
  const siguiente = row.ultimo_numero + 1;
  await conn.query(
    'UPDATE consecutivos_control SET ultimo_numero = ? WHERE anio = ? AND tipo = ?',
    [siguiente, anio, tipo]
  );

  return `${anio}${letra}-${siguiente}`;
}

/**
 * Red de seguridad para flujos que insertan consecutivos textuales sin pasar por
 * `obtenerSiguienteConsecutivo` (ej. importación de Excel histórico): adelanta
 * `ultimo_numero` al máximo real visto en `requerimientos.consecutivo` por año+tipo,
 * nunca hacia atrás, para que la próxima generación automática no colisione.
 */
export async function sincronizarConsecutivosControl(conn) {
  await conn.query(`
    INSERT INTO consecutivos_control (anio, tipo, ultimo_numero)
    SELECT
      CAST(LEFT(consecutivo, 4) AS UNSIGNED) AS anio,
      tipo,
      MAX(CAST(SUBSTRING(consecutivo, LOCATE('-', consecutivo) + 1) AS UNSIGNED)) AS maximo
    FROM requerimientos
    WHERE consecutivo REGEXP '^[0-9]{4}[A-Z]-[0-9]+$'
    GROUP BY anio, tipo
    ON DUPLICATE KEY UPDATE ultimo_numero = GREATEST(ultimo_numero, VALUES(maximo))
  `);
}