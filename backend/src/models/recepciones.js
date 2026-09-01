import pool from '../config/db.js';
import { validarCierreOrden } from '../utils/ocCierre.js';
import { obtenerPorId as obtenerOcPorId } from './ordenes.js';
import { normalizarFechaRecepcion } from '../utils/filtroSolicitante.js';

async function cargarItemsRecepcion(recepcionIds) {
  if (!recepcionIds.length) return {};
  const [rows] = await pool.query(
    `SELECT * FROM recepcion_items WHERE recepcion_id IN (?) ORDER BY id ASC`,
    [recepcionIds]
  );
  const map = {};
  for (const row of rows) {
    if (!map[row.recepcion_id]) map[row.recepcion_id] = [];
    map[row.recepcion_id].push(row);
  }
  return map;
}

async function listarPorOrden(orden_compra_id) {
  const [rows] = await pool.query(
    `SELECT r.*, u.nombre AS recibido_por_nombre
     FROM recepciones r
     JOIN usuarios u ON u.id = r.recibido_por
     WHERE r.orden_compra_id = ?
     ORDER BY r.created_at DESC`,
    [orden_compra_id]
  );

  const itemsMap = await cargarItemsRecepcion(rows.map(r => r.id));
  return rows.map(r => ({ ...r, items: itemsMap[r.id] || [] }));
}

async function obtenerPorId(id) {
  const [[rec]] = await pool.query(
    `SELECT r.*, u.nombre AS recibido_por_nombre
     FROM recepciones r
     JOIN usuarios u ON u.id = r.recibido_por
     WHERE r.id = ?`,
    [id]
  );
  if (!rec) return null;

  const [items] = await pool.query(
    `SELECT * FROM recepcion_items WHERE recepcion_id = ? ORDER BY id ASC`,
    [id]
  );
  return { ...rec, items };
}

async function registrarHistorialOc(conn, ocId, estadoAnterior, estadoNuevo, usuarioId, notas) {
  await conn.query(
    `INSERT INTO historial_estados
       (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
     VALUES ('orden_compra', ?, ?, ?, ?, ?)`,
    [ocId, estadoAnterior, estadoNuevo, usuarioId, notas]
  );
}

/** Normaliza cantidad de recepción (permite decimales). */
function aCantidadRecepcion(valor) {
  const n = parseFloat(valor);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 1000) / 1000;
}

async function insertarItemsRecepcion(conn, recepcionId, items = []) {
  for (const item of items) {
    const recibida = aCantidadRecepcion(item.cantidad_recibida);
    if (recibida <= 0) continue;
    const numRecibo = item.numero_recibo != null && String(item.numero_recibo).trim() !== ''
      ? String(item.numero_recibo).trim()
      : null;
    await conn.query(
      `INSERT INTO recepcion_items
         (recepcion_id, item_key, descripcion, codigo, cantidad_solicitada, cantidad_recibida, unidad, numero_recibo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recepcionId,
        item.item_key,
        item.descripcion || null,
        item.codigo || null,
        parseFloat(item.cantidad_solicitada) || 0,
        recibida,
        item.unidad || null,
        numRecibo,
      ]
    );
  }
}

async function assertOcPermiteRecepciones(conn, ocId) {
  const [[oc]] = await conn.query(
    'SELECT id, estado FROM ordenes_compra WHERE id = ?',
    [ocId]
  );
  if (!oc) throw { status: 404, mensaje: 'Orden de compra no encontrada' };
  if (oc.estado === 'cerrada') {
    throw { status: 422, mensaje: 'La OC está cerrada. No se pueden crear ni modificar recepciones.' };
  }
  if (oc.estado === 'cancelada') {
    throw { status: 422, mensaje: 'La OC está cancelada. No se pueden crear ni modificar recepciones.' };
  }
  return oc;
}

async function calcularAcumuladoPorItem(conn, orden_compra_id, excluir_recepcion_id = null) {
  let sql = `
    SELECT ri.item_key, SUM(ri.cantidad_recibida) AS total
    FROM recepcion_items ri
    JOIN recepciones r ON r.id = ri.recepcion_id
    WHERE r.orden_compra_id = ?
  `;
  const params = [orden_compra_id];
  if (excluir_recepcion_id) {
    sql += ' AND r.id <> ?';
    params.push(excluir_recepcion_id);
  }
  sql += ' GROUP BY ri.item_key';

  const [rows] = await conn.query(sql, params);
  const acumulado = {};
  for (const row of rows) {
    acumulado[row.item_key] = parseFloat(row.total) || 0;
  }
  return acumulado;
}

async function ultimaFechaEntregaPorItem(conn, orden_compra_id) {
  const [rows] = await conn.query(
    `SELECT ri.item_key, MAX(r.fecha_recepcion) AS ultima
     FROM recepcion_items ri
     JOIN recepciones r ON r.id = ri.recepcion_id
     WHERE r.orden_compra_id = ?
       AND ri.cantidad_recibida > 0
     GROUP BY ri.item_key`,
    [orden_compra_id]
  );
  const map = {};
  for (const row of rows) {
    map[row.item_key] = row.ultima || null;
  }
  return map;
}

function construirResumenItemsOc(oc, acumulado) {
  return (oc.items || []).map((it, idx) => {
    const key = it.origen === 'cotizacion'
      ? `cot-${it.id}`
      : it.origen === 'libres'
        ? `lib-${it.id}`
        : `cat-${it.id || idx}`;
    const solicitada = parseFloat(it.cantidad) || 0;
    const recibida = parseFloat(acumulado[key]) || 0;
    return {
      item_key: key,
      codigo: it.codigo || null,
      descripcion: it.descripcion,
      unidad: it.unidad || 'pieza',
      cantidad_solicitada: solicitada,
      cantidad_recibida: recibida,
      pendiente: Math.max(0, solicitada - recibida),
    };
  });
}

async function validarItemsRecepcion(conn, orden_compra_id, items = [], { excluir_recepcion_id } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw { status: 422, mensaje: 'Debe incluir al menos un ítem con cantidad recibida mayor a 0' };
  }

  const [[ocRow]] = await conn.query(
    'SELECT id FROM ordenes_compra WHERE id = ?',
    [orden_compra_id]
  );
  if (!ocRow) throw { status: 404, mensaje: 'Orden de compra no encontrada' };

  const oc = await obtenerOcPorId(orden_compra_id);
  if (!oc) throw { status: 404, mensaje: 'Orden de compra no encontrada' };

  const acumulado = await calcularAcumuladoPorItem(conn, orden_compra_id, excluir_recepcion_id);
  const resumen = construirResumenItemsOc(oc, acumulado);
  const mapPendiente = Object.fromEntries(resumen.map((r) => [r.item_key, r.pendiente]));
  const mapDesc = Object.fromEntries(resumen.map((r) => [r.item_key, r.descripcion || r.codigo || r.item_key]));

  let tieneCantidad = false;
  for (const item of items) {
    const recibida = aCantidadRecepcion(item.cantidad_recibida);
    if (recibida <= 0) continue;
    tieneCantidad = true;

    if (mapPendiente[item.item_key] == null) {
      throw {
        status: 422,
        mensaje: `El ítem "${item.descripcion || item.item_key}" no corresponde a esta OC.`,
      };
    }
    const pendiente = Math.max(0, parseFloat(mapPendiente[item.item_key]) || 0);
    if (recibida > pendiente + 0.0001) {
      const etiqueta = mapDesc[item.item_key] || item.descripcion || item.codigo || item.item_key;
      throw {
        status: 422,
        mensaje: `La cantidad recibida (${recibida}) supera el pendiente actual (${pendiente}) para "${etiqueta}". Revisa las recepciones registradas.`,
      };
    }
  }

  if (!tieneCantidad) {
    throw { status: 422, mensaje: 'Debe incluir al menos un ítem con cantidad recibida mayor a 0' };
  }
}

async function asegurarEstadoEnProceso(conn, ocId, estadoAnterior, usuarioId) {
  if (['distribuida', 'generada'].includes(estadoAnterior)) {
    await conn.query(
      `UPDATE ordenes_compra SET estado = 'en_proceso' WHERE id = ? AND estado IN ('generada', 'distribuida')`,
      [ocId]
    );
    await registrarHistorialOc(
      conn,
      ocId,
      estadoAnterior,
      'en_proceso',
      usuarioId,
      'Recepción registrada — OC en proceso'
    );
    return 'en_proceso';
  }
  return estadoAnterior;
}

async function crear(datos, recibido_por) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[ocAntes]] = await conn.query(
      'SELECT id, estado, datatextnow_id FROM ordenes_compra WHERE id = ? FOR UPDATE',
      [datos.orden_compra_id]
    );
    if (!ocAntes) throw { status: 404, mensaje: 'Orden de compra no encontrada' };
    await assertOcPermiteRecepciones(conn, datos.orden_compra_id);

    if (Array.isArray(datos.items) && datos.items.length > 0) {
      await validarItemsRecepcion(conn, datos.orden_compra_id, datos.items);
    }

    const esCompleta = datos.estado !== 'recibido_parcial';
    const estadoRecepcion = datos.estado || 'recibido_completo';
    const fechaRec = normalizarFechaRecepcion(datos.fecha_recepcion);

    const [result] = await conn.query(
      `INSERT INTO recepciones
         (orden_compra_id, recibido_por, estado, notas, datatextnow_id, fecha_recepcion)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        datos.orden_compra_id,
        recibido_por,
        estadoRecepcion,
        datos.notas || null,
        datos.datatextnow_id || null,
        fechaRec,
      ]
    );
    const recepcionId = result.insertId;

    if (Array.isArray(datos.items) && datos.items.length > 0) {
      await insertarItemsRecepcion(conn, recepcionId, datos.items);
    }

    if (datos.datatextnow_id) {
      await conn.query(
        'UPDATE ordenes_compra SET datatextnow_id = ? WHERE id = ?',
        [datos.datatextnow_id, datos.orden_compra_id]
      );
    }

    let cerrada = false;
    let estadoOc = ocAntes.estado;

    estadoOc = await asegurarEstadoEnProceso(conn, datos.orden_compra_id, ocAntes.estado, recibido_por);

    if (esCompleta && datos.cerrar_oc) {
      const validacion = await validarCierreOrden(conn, datos.orden_compra_id, { permitirParcial: true });
      if (validacion.ok) {
        cerrada = true;
        await conn.query(
          `UPDATE ordenes_compra
           SET estado = 'cerrada', datatextnow_id = COALESCE(datatextnow_id, ?)
           WHERE id = ? AND estado NOT IN ('cerrada', 'cancelada')`,
          [validacion.po, datos.orden_compra_id]
        );
        await registrarHistorialOc(
          conn,
          datos.orden_compra_id,
          estadoOc,
          'cerrada',
          recibido_por,
          'Recepción completa — OC cerrada'
        );
      }
    } else if (esCompleta) {
      const validacion = await validarCierreOrden(conn, datos.orden_compra_id, { permitirParcial: true });
      if (validacion.ok) {
        cerrada = true;
        await conn.query(
          `UPDATE ordenes_compra
           SET estado = 'cerrada', datatextnow_id = COALESCE(datatextnow_id, ?)
           WHERE id = ? AND estado NOT IN ('cerrada', 'cancelada')`,
          [validacion.po, datos.orden_compra_id]
        );
        await registrarHistorialOc(
          conn,
          datos.orden_compra_id,
          estadoOc,
          'cerrada',
          recibido_por,
          'Recepción completa registrada — OC cerrada automáticamente'
        );
      } else if (estadoOc !== 'recibida') {
        await conn.query(
          `UPDATE ordenes_compra SET estado = 'recibida'
           WHERE id = ? AND estado IN ('distribuida', 'en_proceso')`,
          [datos.orden_compra_id]
        );
        await registrarHistorialOc(
          conn,
          datos.orden_compra_id,
          estadoOc,
          'recibida',
          recibido_por,
          `Recepción completa registrada${validacion.mensaje.includes('DataTextNow') ? ' — pendiente PO DataTextNow para cierre' : ''}`
        );
      }
    }

    await conn.commit();
    return { id: recepcionId, cerrada, pendientePo: esCompleta && !cerrada };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function actualizar(id, datos, usuarioId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const rec = await obtenerPorId(id);
    if (!rec) throw { status: 404, mensaje: 'Recepción no encontrada' };

    await assertOcPermiteRecepciones(conn, rec.orden_compra_id);

    if (Array.isArray(datos.items)) {
      await validarItemsRecepcion(conn, rec.orden_compra_id, datos.items, {
        excluir_recepcion_id: id,
      });
    }

    const campos = [];
    const params = [];

    if (datos.estado !== undefined) { campos.push('estado = ?'); params.push(datos.estado); }
    if (datos.notas !== undefined) { campos.push('notas = ?'); params.push(datos.notas); }
    if (datos.datatextnow_id !== undefined) { campos.push('datatextnow_id = ?'); params.push(datos.datatextnow_id); }
    if (datos.fecha_recepcion !== undefined) {
      const fechaRec = normalizarFechaRecepcion(datos.fecha_recepcion);
      if (fechaRec) {
        campos.push('fecha_recepcion = ?');
        params.push(fechaRec);
      }
    }

    if (campos.length) {
      params.push(id);
      await conn.query(`UPDATE recepciones SET ${campos.join(', ')} WHERE id = ?`, params);
    }

    if (Array.isArray(datos.items)) {
      await conn.query('DELETE FROM recepcion_items WHERE recepcion_id = ?', [id]);
      await insertarItemsRecepcion(conn, id, datos.items);
    }

    if (datos.datatextnow_id) {
      await conn.query(
        'UPDATE ordenes_compra SET datatextnow_id = ? WHERE id = ?',
        [datos.datatextnow_id, rec.orden_compra_id]
      );
    }

    await conn.commit();
    return await obtenerPorId(id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function eliminar(id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rec = await obtenerPorId(id);
    if (!rec) {
      await conn.rollback();
      return 0;
    }

    await assertOcPermiteRecepciones(conn, rec.orden_compra_id);

    await conn.query('DELETE FROM recepcion_items WHERE recepcion_id = ?', [id]);
    const [result] = await conn.query('DELETE FROM recepciones WHERE id = ?', [id]);
    await conn.commit();
    return result.affectedRows;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Filas de Excel OC: exactamente una por recepción (GROUP BY recepcion_id).
 * % = cantidad de ESA entrega / cantidad total pedida en la OC.
 */
async function lineasEntregaExcelOrden(orden_compra_id) {
  const oc = await obtenerOcPorId(orden_compra_id);
  if (!oc) return [];

  const catalogo = construirResumenItemsOc(oc, {});
  const totalSol = catalogo.reduce((s, it) => s + (parseFloat(it.cantidad_solicitada) || 0), 0);

  const [grupos] = await pool.query(
    `SELECT
        r.id AS recepcion_id,
        r.fecha_recepcion AS fecha_entrega,
        SUM(ri.cantidad_recibida) AS cantidad_recibida,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(ri.codigo), '') SEPARATOR ', ') AS codigo,
        GROUP_CONCAT(
          CONCAT(
            IF(NULLIF(TRIM(ri.codigo), '') IS NULL, '', CONCAT(TRIM(ri.codigo), ' — ')),
            COALESCE(ri.descripcion, ''),
            ' (', ri.cantidad_recibida,
            IF(NULLIF(TRIM(ri.unidad), '') IS NULL, '', CONCAT(' ', ri.unidad)),
            ')'
          )
          ORDER BY ri.id SEPARATOR '; '
        ) AS descripcion,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(ri.numero_recibo), '') SEPARATOR ', ') AS numero_recibo,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(ri.unidad), '') SEPARATOR ', ') AS unidad
     FROM recepciones r
     INNER JOIN recepcion_items ri
        ON ri.recepcion_id = r.id AND ri.cantidad_recibida > 0
     WHERE r.orden_compra_id = ?
     GROUP BY r.id, r.fecha_recepcion
     ORDER BY r.fecha_recepcion ASC, r.id ASC`,
    [orden_compra_id]
  );

  if (!grupos.length) {
    return [{
      codigo: catalogo.map((it) => it.codigo).filter(Boolean).join(', '),
      descripcion: catalogo.map((it) => it.descripcion).filter(Boolean).join('; '),
      unidad: catalogo.length === 1 ? (catalogo[0].unidad || '') : '',
      cantidad_solicitada: totalSol,
      cantidad_recibida: 0,
      pct_entrega: '',
      fecha_entrega: null,
      numero_recibo: '',
    }];
  }

  return grupos.map((g) => {
    const rec = parseFloat(g.cantidad_recibida) || 0;
    const pct = totalSol > 0 ? Math.min(100, Math.round((rec / totalSol) * 100)) : '';
    const unidades = String(g.unidad || '').split(',').map((s) => s.trim()).filter(Boolean);
    return {
      codigo: g.codigo || '',
      descripcion: g.descripcion || '',
      unidad: unidades.length === 1 ? unidades[0] : '',
      cantidad_solicitada: totalSol,
      cantidad_recibida: rec,
      pct_entrega: pct,
      fecha_entrega: g.fecha_entrega || null,
      numero_recibo: g.numero_recibo || '',
    };
  });
}

/**
 * Ítems de la OC con cantidades solicitadas y recibidas acumuladas.
 * @param {object} [opciones]
 * @param {number} [opciones.excluir_recepcion_id] — al editar, excluye esa recepción del acumulado
 */

async function resumenItemsOrden(orden_compra_id, opciones = {}) {
  const { excluir_recepcion_id = null, conn = null } = opciones;
  const db = conn || pool;

  const oc = await obtenerOcPorId(orden_compra_id);
  if (!oc) return [];

  const acumulado = await calcularAcumuladoPorItem(db, orden_compra_id, excluir_recepcion_id);
  const fechas = await ultimaFechaEntregaPorItem(db, orden_compra_id);
  return construirResumenItemsOc(oc, acumulado).map((it) => {
    const sol = parseFloat(it.cantidad_solicitada) || 0;
    const rec = parseFloat(it.cantidad_recibida) || 0;
    const pct = sol > 0 ? Math.min(100, Math.round((rec / sol) * 100)) : 0;
    return {
      ...it,
      pct_entrega: pct,
      fecha_ultima_entrega: fechas[it.item_key] || null,
    };
  });
}

export {
  listarPorOrden,
  obtenerPorId,
  crear,
  actualizar,
  eliminar,
  resumenItemsOrden,
  lineasEntregaExcelOrden,
};
