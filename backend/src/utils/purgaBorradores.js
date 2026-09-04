/**
 * Purga mensual: borradores e incompletos más viejos que el mes anterior.
 * El 1 de septiembre toca julio y anteriores; agosto se conserva todo el mes.
 * Con N° → cancelado (rechazado); sin N° (borrador) → se elimina.
 */
import logger from './logger.js';
import { umbralPurgaBorradores, ymd } from './fechas.js';
import { fechaHoyMexico, obtenerAjustesCorreo } from '../models/configApp.js';
import { purgarBorradoresEIncompletos } from '../models/requerimientos.js';
import pool from '../config/db.js';

async function leerUltimaPurga() {
  try {
    const [[row]] = await pool.query(
      'SELECT purga_borradores_ultimo FROM configuracion_app WHERE id = 1 LIMIT 1'
    );
    const ultimo = ymd(row?.purga_borradores_ultimo);
    return ultimo || null;
  } catch (err) {
    if (err?.code === 'ER_BAD_FIELD_ERROR' || err?.code === 'ER_NO_SUCH_TABLE') return null;
    throw err;
  }
}

async function marcarPurgaEjecutada(dia) {
  const ymd = String(dia).slice(0, 10);
  try {
    await pool.query(
      `INSERT INTO configuracion_app (id, purga_borradores_ultimo)
       VALUES (1, ?)
       ON DUPLICATE KEY UPDATE purga_borradores_ultimo = VALUES(purga_borradores_ultimo)`,
      [ymd]
    );
  } catch (err) {
    if (err?.code !== 'ER_BAD_FIELD_ERROR' && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
}

/**
 * @param {{ forzar?: boolean, hoy?: string, actorUserId?: number }} [opts]
 * hoy = YYYY-MM-DD en calendario México (tests).
 * actorUserId = Admin que disparó la purga (historial.cambiado_por es NOT NULL en el servidor).
 */
export async function ejecutarPurgaBorradores({ forzar = false, hoy = null, actorUserId = null } = {}) {
  const dia = hoy || fechaHoyMexico();
  const ajustes = await obtenerAjustesCorreo();
  if (ajustes.purga_borradores === false) {
    return { success: true, skipped: true, reason: 'purga_off', dia, borrados: 0, cancelados: 0 };
  }
  if (!forzar) {
    const ultimo = await leerUltimaPurga();
    if (ultimo && String(ultimo).slice(0, 7) === String(dia).slice(0, 7)) {
      return { success: true, skipped: true, reason: 'ya_ejecutada', dia, borrados: 0, cancelados: 0 };
    }
  }

  const { corte, umbral } = umbralPurgaBorradores(dia);
  const result = await purgarBorradoresEIncompletos({ umbral, actorUserId });
  await marcarPurgaEjecutada(dia);

  logger.info('[Mantenimiento] Purga REQ borrador/incompleto', {
    dia,
    corte,
    borrados: result.borrados,
    cancelados: result.cancelados,
    ids: result.ids,
  });
  console.log(
    `[Mantenimiento] Purga REQ ${dia} corte<${corte} cancelados=${result.cancelados || 0} borrados=${result.borrados}`
  );
  return {
    success: true,
    dia,
    corte,
    borrados: result.borrados,
    cancelados: result.cancelados || 0,
    ids: result.ids || [],
    idsBorrados: result.idsBorrados || [],
    idsCancelados: result.idsCancelados || [],
    detalle: result.detalle || [],
  };
}

export function iniciarSchedulerPurgaBorradores() {
  const TICK_MS = 15 * 60 * 1000;
  const tick = async () => {
    try {
      const hora = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Mexico_City',
          hour: 'numeric',
          hour12: false,
        }).format(new Date())
      );
      if (hora < 7) return;
      const r = await ejecutarPurgaBorradores({ forzar: false });
      if (r?.skipped) return;
    } catch (err) {
      console.warn('[Mantenimiento] Scheduler purga REQ:', err.message);
    }
  };
  setInterval(tick, TICK_MS);
  setTimeout(tick, 60_000);
}
