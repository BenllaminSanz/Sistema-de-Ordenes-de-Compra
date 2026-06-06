import pool from '../config/db.js';
import { validarCierreOrden } from '../utils/ocCierre.js';

async function listarPorOrden(orden_compra_id) {
  const [rows] = await pool.query(
    `SELECT r.*, u.nombre AS recibido_por_nombre
     FROM recepciones r
     JOIN usuarios u ON u.id = r.recibido_por
     WHERE r.orden_compra_id = ?
     ORDER BY r.created_at DESC`,
    [orden_compra_id]
  );
  return rows;
}

async function obtenerPorId(id) {
  const [[rec]] = await pool.query(
    `SELECT r.*, u.nombre AS recibido_por_nombre
     FROM recepciones r
     JOIN usuarios u ON u.id = r.recibido_por
     WHERE r.id = ?`,
    [id]
  );
  return rec || null;
}

async function registrarHistorialOc(conn, ocId, estadoAnterior, estadoNuevo, usuarioId, notas) {
  await conn.query(
    `INSERT INTO historial_estados
       (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
     VALUES ('orden_compra', ?, ?, ?, ?, ?)`,
    [ocId, estadoAnterior, estadoNuevo, usuarioId, notas]
  );
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

    const esCompleta = datos.estado !== 'recibido_parcial';
    const estadoRecepcion = datos.estado || 'recibido_completo';

    const [result] = await conn.query(
      `INSERT INTO recepciones
         (orden_compra_id, recibido_por, estado, notas, datatextnow_id, fecha_recepcion)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        datos.orden_compra_id,
        recibido_por,
        estadoRecepcion,
        datos.notas || null,
        datos.datatextnow_id || null,
      ]
    );
    const recepcionId = result.insertId;

    if (datos.datatextnow_id) {
      await conn.query(
        'UPDATE ordenes_compra SET datatextnow_id = ? WHERE id = ?',
        [datos.datatextnow_id, datos.orden_compra_id]
      );
    }

    let cerrada = false;

    if (esCompleta) {
      const validacion = await validarCierreOrden(conn, datos.orden_compra_id);
      const estadoAnterior = ocAntes.estado;

      if (validacion.ok) {
        cerrada = true;
        await conn.query(
          `UPDATE recepciones
           SET estado = 'entregado_solicitante', fecha_entrega = NOW()
           WHERE id = ?`,
          [recepcionId]
        );

        await conn.query(
          `UPDATE ordenes_compra
           SET estado = 'cerrada', datatextnow_id = COALESCE(datatextnow_id, ?)
           WHERE id = ? AND estado IN ('distribuida', 'en_proceso', 'recibida')`,
          [validacion.po, datos.orden_compra_id]
        );

        await registrarHistorialOc(
          conn,
          datos.orden_compra_id,
          estadoAnterior,
          'cerrada',
          recibido_por,
          'Recepción completa registrada — OC cerrada automáticamente'
        );
      } else {
        await conn.query(
          `UPDATE ordenes_compra SET estado = 'recibida'
           WHERE id = ? AND estado IN ('distribuida', 'en_proceso')`,
          [datos.orden_compra_id]
        );

        await registrarHistorialOc(
          conn,
          datos.orden_compra_id,
          estadoAnterior,
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

async function marcarEntregado(id, usuarioId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `UPDATE recepciones
       SET estado = 'entregado_solicitante', fecha_entrega = NOW()
       WHERE id = ?`,
      [id]
    );
    if (!result.affectedRows) {
      await conn.rollback();
      return 0;
    }

    const [[rec]] = await conn.query(
      'SELECT orden_compra_id FROM recepciones WHERE id = ?',
      [id]
    );

    const [[oc]] = await conn.query(
      'SELECT estado FROM ordenes_compra WHERE id = ?',
      [rec.orden_compra_id]
    );

    const validacion = await validarCierreOrden(conn, rec.orden_compra_id);
    if (validacion.ok && oc.estado !== 'cerrada') {
      await conn.query(
        `UPDATE ordenes_compra
         SET estado = 'cerrada', datatextnow_id = COALESCE(datatextnow_id, ?)
         WHERE id = ? AND estado IN ('recibida', 'en_proceso', 'distribuida')`,
        [validacion.po, rec.orden_compra_id]
      );

      await registrarHistorialOc(
        conn,
        rec.orden_compra_id,
        oc.estado,
        'cerrada',
        usuarioId,
        'Entregado al solicitante — OC cerrada automáticamente'
      );
    }

    await conn.commit();
    return result.affectedRows;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export { listarPorOrden, obtenerPorId, crear, marcarEntregado };