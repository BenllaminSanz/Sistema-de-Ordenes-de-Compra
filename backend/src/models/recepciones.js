import pool from '../config/db.js';

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

async function crear(datos, recibido_por) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO recepciones
         (orden_compra_id, recibido_por, estado, notas, datatextnow_id, fecha_recepcion)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        datos.orden_compra_id,
        recibido_por,
        datos.estado || 'recibido_completo',
        datos.notas || null,
        datos.datatextnow_id || null,
      ]
    );
    const recepcionId = result.insertId;

    // Si es recepción completa, avanzar la OC a estado 'recibida'
    if (datos.estado !== 'recibido_parcial') {
      await conn.query(
        `UPDATE ordenes_compra SET estado = 'recibida'
         WHERE id = ? AND estado IN ('distribuida','en_proceso')`,
        [datos.orden_compra_id]
      );
      await conn.query(
        `INSERT INTO historial_estados
           (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
         SELECT 'orden_compra', oc.id, oc.estado, 'recibida', ?, 'Recepción registrada'
         FROM ordenes_compra oc WHERE oc.id = ?`,
        [recibido_por, datos.orden_compra_id]
      );
    }

    await conn.commit();
    return recepcionId;
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

    const [[rec]] = await conn.query(
      'SELECT orden_compra_id FROM recepciones WHERE id = ?', [id]
    );

    // Cerrar la OC automáticamente al entregar
    await conn.query(
      `UPDATE ordenes_compra SET estado = 'cerrada'
       WHERE id = ? AND estado = 'recibida'`,
      [rec.orden_compra_id]
    );
    await conn.query(
      `INSERT INTO historial_estados
         (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
       VALUES ('orden_compra', ?, 'recibida', 'cerrada', ?, 'Entregado al solicitante')`,
      [rec.orden_compra_id, usuarioId]
    );

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