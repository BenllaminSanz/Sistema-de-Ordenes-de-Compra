/**
 * Sincroniza estados de Órdenes de Compra (y REQ ligado) desde Excel BASE GRAL.
 * No borra ni crea filas: solo actualiza las OC existentes por consecutivo (N°).
 *
 * Mapeo Estado Excel → OC:
 *   Cerrada     → cerrada
 *   Distribuida → distribuida
 *   Parcial     → en_proceso
 *   Cancelada   → cancelada (+ REQ rechazado)
 *   (otros)     → no toca OC
 *
 * Pensado para la recarga histórica / archivo de Contabilidad con estados reales de OC.
 * Omite la máquina de transiciones del flujo normal (cierre sin recepciones, etc.).
 */

import { parseExcelRequerimientos, mapearEstadoExcel, normalizarPoExcel } from './excelRequerimientos.js';
import logger from './logger.js';

const ESTADOS_OC_VALIDOS = new Set([
  'generada',
  'distribuida',
  'en_proceso',
  'recibida',
  'cerrada',
  'cancelada',
]);

/**
 * @param {object} opts
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} opts.db
 * @param {Buffer} [opts.buffer]
 * @param {object[]} [opts.filas] filas ya parseadas (parseExcelRequerimientos)
 * @param {number} opts.actorUserId
 * @param {boolean} [opts.dryRun=false]
 * @param {boolean} [opts.actualizarPo=true] alinear datatextnow_id / fecha_po si vienen en Excel
 */
export async function sincronizarEstadosOcDesdeExcel(opts = {}) {
  const {
    db,
    buffer,
    actorUserId,
    dryRun = false,
    actualizarPo = true,
  } = opts;

  if (!db) throw new Error('db es requerido');
  if (!actorUserId) throw new Error('actorUserId es requerido');

  let filas = opts.filas;
  let parseMeta = null;
  if (buffer) {
    const parsed = parseExcelRequerimientos(buffer);
    filas = parsed.filas;
    parseMeta = {
      layout: parsed.layout,
      duplicados: parsed.duplicados?.length || 0,
      meta: parsed.meta,
    };
  }
  if (!filas?.length) {
    return { ok: false, mensaje: 'No hay filas en el Excel', parseMeta };
  }

  const [ocRows] = await db.query(`
    SELECT
      oc.id AS oc_id,
      oc.numero_oc,
      oc.estado AS oc_estado,
      oc.datatextnow_id,
      oc.fecha_po,
      oc.requerimiento_id,
      r.consecutivo,
      r.estado AS req_estado
    FROM ordenes_compra oc
    JOIN requerimientos r ON r.id = oc.requerimiento_id
    WHERE r.consecutivo IS NOT NULL AND r.consecutivo <> ''
  `);

  const byConsecutivo = new Map();
  for (const row of ocRows) {
    byConsecutivo.set(String(row.consecutivo).trim().toUpperCase(), row);
  }

  const reporte = {
    dryRun,
    totalFilasExcel: filas.length,
    conOcEnBd: 0,
    sinOcEnBd: 0,
    sinCambio: 0,
    actualizados: 0,
    porCambio: {}, // "distribuida→cerrada": n
    porObjetivo: {},
    muestra: [],
    sinOcMuestra: [],
    errores: [],
    parseMeta,
  };

  const plan = []; // { oc, nuevoOc, nuevoReq?, po?, fechaPo?, notas }

  for (const f of filas) {
    const key = String(f.consecutivo || '').trim().toUpperCase();
    if (!key) continue;

    // Preferir mapeo de la fila ya parseada; si no, recalcular
    let ocEstadoObj = f.ocEstado || null;
    let reqEstadoObj = f.reqEstado || null;
    if (!ocEstadoObj && f.estado_excel) {
      const m = mapearEstadoExcel(f.estado_excel);
      ocEstadoObj = m.ocEstado;
      reqEstadoObj = m.reqEstado;
    } else if (!ocEstadoObj && f.estado) {
      const m = mapearEstadoExcel(f.estado);
      ocEstadoObj = m.ocEstado;
      reqEstadoObj = m.reqEstado;
    }

    // Si el parser viejo no trajo Parcial bien, forzar por texto
    const estadoTxt = String(f.estado_excel || f.estado || '').toLowerCase();
    if (!ocEstadoObj && estadoTxt.includes('parcial')) {
      ocEstadoObj = 'en_proceso';
      reqEstadoObj = 'cerrado';
    }

    if (!ocEstadoObj || !ESTADOS_OC_VALIDOS.has(ocEstadoObj)) {
      // Estados solo de REQ (En revisión, Aprobado…) — no tocan OC
      continue;
    }

    const dbOc = byConsecutivo.get(key);
    if (!dbOc) {
      reporte.sinOcEnBd += 1;
      if (reporte.sinOcMuestra.length < 40) {
        reporte.sinOcMuestra.push({
          consecutivo: f.consecutivo,
          estadoExcel: f.estado_excel || f.estado,
          ocObjetivo: ocEstadoObj,
          po: f.oc_numero,
        });
      }
      continue;
    }

    reporte.conOcEnBd += 1;
    const actual = dbOc.oc_estado;
    const objetivo = ocEstadoObj;

    const poInfo = normalizarPoExcel(f.oc_numero ?? f.oc);
    const poNuevo = !poInfo.sinPo ? (poInfo.po || (poInfo.esNa ? 'NA' : null)) : null;
    const fechaPo = f.fecha_po || null;
    const fechaPoBd = dbOc.fecha_po
      ? (dbOc.fecha_po instanceof Date
          ? dbOc.fecha_po.toISOString().slice(0, 10)
          : String(dbOc.fecha_po).slice(0, 10))
      : '';
    const fechaPoExcel = fechaPo ? String(fechaPo).slice(0, 10) : '';

    const cambiaEstado = actual !== objetivo;
    const cambiaPo =
      actualizarPo &&
      poNuevo &&
      String(dbOc.datatextnow_id || '').trim().toUpperCase() !== String(poNuevo).trim().toUpperCase();
    const cambiaFecha =
      actualizarPo &&
      fechaPoExcel &&
      fechaPoBd !== fechaPoExcel;

    if (!cambiaEstado && !cambiaPo && !cambiaFecha) {
      reporte.sinCambio += 1;
      continue;
    }

    const item = {
      ocId: dbOc.oc_id,
      reqId: dbOc.requerimiento_id,
      consecutivo: dbOc.consecutivo,
      estadoActual: actual,
      estadoNuevo: objetivo,
      reqEstadoActual: dbOc.req_estado,
      reqEstadoNuevo: reqEstadoObj || null,
      poActual: dbOc.datatextnow_id,
      poNuevo: cambiaPo ? poNuevo : null,
      fechaPoNueva: cambiaFecha ? fechaPo : null,
      cambiaEstado,
      estadoExcel: f.estado_excel || f.estado,
    };
    plan.push(item);

    if (cambiaEstado) {
      const k = `${actual}→${objetivo}`;
      reporte.porCambio[k] = (reporte.porCambio[k] || 0) + 1;
    }
    reporte.porObjetivo[objetivo] = (reporte.porObjetivo[objetivo] || 0) + 1;

    if (reporte.muestra.length < 30) {
      reporte.muestra.push({
        consecutivo: item.consecutivo,
        de: item.estadoActual,
        a: item.estadoNuevo,
        po: item.poNuevo || item.poActual,
        excel: item.estadoExcel,
      });
    }
  }

  if (dryRun) {
    reporte.actualizados = plan.length;
    reporte.ok = true;
    reporte.mensaje =
      `Dry-run: ${plan.length} OC a actualizar, ${reporte.sinCambio} sin cambio, ` +
      `${reporte.sinOcEnBd} en Excel sin OC en BD.`;
    return reporte;
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const item of plan) {
      try {
        if (item.cambiaEstado) {
          await conn.query('UPDATE ordenes_compra SET estado = ? WHERE id = ?', [
            item.estadoNuevo,
            item.ocId,
          ]);
          await conn.query(
            `INSERT INTO historial_estados
               (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
             VALUES ('orden_compra', ?, ?, ?, ?, ?)`,
            [
              item.ocId,
              item.estadoActual,
              item.estadoNuevo,
              actorUserId,
              `Sync Excel BASE GRAL · Estado: ${item.estadoExcel || item.estadoNuevo}`,
            ]
          );
        }

        if (item.poNuevo || item.fechaPoNueva) {
          const sets = [];
          const params = [];
          if (item.poNuevo) {
            sets.push('datatextnow_id = ?');
            params.push(item.poNuevo);
          }
          if (item.fechaPoNueva) {
            sets.push('fecha_po = ?');
            params.push(item.fechaPoNueva);
          }
          params.push(item.ocId);
          await conn.query(
            `UPDATE ordenes_compra SET ${sets.join(', ')} WHERE id = ?`,
            params
          );
        }

        // REQ: si OC queda cerrada/en_proceso/distribuida → REQ cerrado; cancelada → rechazado
        if (item.cambiaEstado && item.reqEstadoNuevo && item.reqEstadoActual !== item.reqEstadoNuevo) {
          // Solo forzar cerrado/rechazado; no bajar de cerrado a borrador
          const dest = item.reqEstadoNuevo;
          if (dest === 'cerrado' || dest === 'rechazado') {
            await conn.query('UPDATE requerimientos SET estado = ? WHERE id = ?', [
              dest,
              item.reqId,
            ]);
            await conn.query(
              `INSERT INTO historial_estados
                 (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
               VALUES ('requerimiento', ?, ?, ?, ?, ?)`,
              [
                item.reqId,
                item.reqEstadoActual,
                dest,
                actorUserId,
                `Sync Excel BASE GRAL (OC ${item.estadoNuevo})`,
              ]
            );
          }
        }

        reporte.actualizados += 1;
      } catch (rowErr) {
        reporte.errores.push({
          consecutivo: item.consecutivo,
          error: rowErr.message,
        });
      }
    }

    await conn.commit();
    reporte.ok = true;
    reporte.mensaje =
      `Actualizadas ${reporte.actualizados} OC. Sin cambio: ${reporte.sinCambio}. ` +
      `Sin OC en BD: ${reporte.sinOcEnBd}. Errores: ${reporte.errores.length}.`;
    return reporte;
  } catch (err) {
    await conn.rollback();
    logger.error('[sincronizarEstadosOcDesdeExcel]', err);
    throw err;
  } finally {
    conn.release();
  }
}
