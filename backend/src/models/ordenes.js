import pool from '../config/db.js';

async function generarNumeroOC(conn) {
  const anio = new Date().getFullYear();
  const prefijo = `OC-${anio}-`;
  const [rows] = await conn.query(
    `SELECT numero_oc FROM ordenes_compra
     WHERE numero_oc LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefijo}%`]
  );
  if (!rows.length) return `${prefijo}0001`;
  const ultimo = parseInt(rows[0].numero_oc.split('-')[2], 10);
  return `${prefijo}${String(ultimo + 1).padStart(4, '0')}`;
}

async function listar(filtros = {}) {
  const { estado, solicitante_id, fecha_desde, fecha_hasta, pagina = 1, limite = 20 } = filtros;

  let where = [];
  let params = [];

  if (estado) {
    where.push('oc.estado = ?');
    params.push(estado);
  }

  if (solicitante_id) {
    where.push('r.solicitante_id = ?');
    params.push(solicitante_id);
  }

  if (fecha_desde) {
    where.push('(DATE(oc.fecha_autorizacion) >= ? OR DATE(oc.created_at) >= ?)');
    params.push(fecha_desde, fecha_desde);
  }

  if (fecha_hasta) {
    where.push('(DATE(oc.fecha_autorizacion) <= ? OR DATE(oc.created_at) <= ?)');
    params.push(fecha_hasta, fecha_hasta);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (pagina - 1) * limite;

  const [rows] = await pool.query(
    `SELECT
       oc.id, oc.numero_oc, oc.estado,
       oc.fecha_autorizacion, oc.datatextnow_id,
       oc.created_at,
       r.consecutivo, r.tipo, r.notas AS descripcion, r.solicitante_id,
       u.nombre AS autorizado_por_nombre,
       p.nombre AS proveedor_nombre,
       c.monto_total,
       rec.estado AS estado_recepcion,
       rec.fecha_recepcion
     FROM ordenes_compra oc
     JOIN requerimientos r ON r.id = oc.requerimiento_id
     JOIN usuarios u       ON u.id = oc.autorizado_por
     LEFT JOIN cotizaciones c ON c.id = oc.cotizacion_id
     LEFT JOIN proveedores  p ON p.id = c.proveedor_id
     LEFT JOIN recepciones rec ON rec.orden_compra_id = oc.id
     ${whereClause}
     ORDER BY oc.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limite), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total 
     FROM ordenes_compra oc
     JOIN requerimientos r ON r.id = oc.requerimiento_id
     ${whereClause}`, params
  );

  return { datos: rows, total, pagina: Number(pagina), limite: Number(limite) };
}

async function obtenerPorId(id) {
  const [[oc]] = await pool.query(
    `SELECT oc.*,
       r.consecutivo, r.tipo, r.notas AS descripcion, r.requiere_cotizacion, r.solicitante_id,
       u.nombre  AS autorizado_por_nombre,
       s.nombre  AS solicitante_nombre,
       p.nombre  AS proveedor_nombre,
       c.monto_total, c.moneda, c.archivo_url
     FROM ordenes_compra oc
     JOIN requerimientos r ON r.id = oc.requerimiento_id
     JOIN usuarios u       ON u.id = oc.autorizado_por
     LEFT JOIN usuarios s  ON s.id = r.solicitante_id
     LEFT JOIN cotizaciones c ON c.id = oc.cotizacion_id
     LEFT JOIN proveedores  p ON p.id = c.proveedor_id
     WHERE oc.id = ?`,
    [id]
  );
  if (!oc) return null;

  const [historial] = await pool.query(
    `SELECT h.estado_anterior, h.estado_nuevo, h.notas, h.created_at,
            u.nombre AS cambiado_por
     FROM historial_estados h
     JOIN usuarios u ON u.id = h.cambiado_por
     WHERE h.entidad_tipo = 'orden_compra' AND h.entidad_id = ?
     ORDER BY h.created_at ASC`,
    [id]
  );
  return { ...oc, historial };
}

async function crear(requerimiento_id, cotizacion_id, autorizado_por) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const numero_oc = await generarNumeroOC(conn);

    const [result] = await conn.query(
      `INSERT INTO ordenes_compra
         (numero_oc, requerimiento_id, cotizacion_id, autorizado_por,
          estado, fecha_autorizacion)
       VALUES (?, ?, ?, ?, 'generada', NOW())`,
      [numero_oc, requerimiento_id, cotizacion_id || null, autorizado_por]
    );
    const ocId = result.insertId;

    // Marcar el requerimiento como aprobado si no lo estaba
    await conn.query(
      `UPDATE requerimientos SET estado = 'aprobado'
       WHERE id = ? AND estado != 'aprobado'`,
      [requerimiento_id]
    );

    await conn.query(
      `INSERT INTO historial_estados
         (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
       VALUES ('orden_compra', ?, NULL, 'generada', ?, 'OC generada')`,
      [ocId, autorizado_por]
    );

    await conn.commit();
    return ocId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

const TRANSICIONES_OC = {
  generada:    ['distribuida', 'cancelada'],
  distribuida: ['en_proceso', 'cancelada'],
  en_proceso:  ['recibida',   'cancelada'],
  recibida:    ['cerrada'],
  cerrada:     [],
  cancelada:   [],
};

async function cambiarEstado(id, nuevoEstado, usuarioId, notas = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[oc]] = await conn.query(
      'SELECT estado FROM ordenes_compra WHERE id = ? FOR UPDATE', [id]
    );
    if (!oc) throw { status: 404, mensaje: 'Orden de compra no encontrada' };

    const permitidos = TRANSICIONES_OC[oc.estado] || [];
    if (!permitidos.includes(nuevoEstado)) {
      throw { status: 422, mensaje: `No se puede pasar de '${oc.estado}' a '${nuevoEstado}'` };
    }

    await conn.query(
      'UPDATE ordenes_compra SET estado = ? WHERE id = ?',
      [nuevoEstado, id]
    );
    await conn.query(
      `INSERT INTO historial_estados
         (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
       VALUES ('orden_compra', ?, ?, ?, ?, ?)`,
      [id, oc.estado, nuevoEstado, usuarioId, notas]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Actualiza el número de PO / Order code proveniente de DataTextNow (de los reportes Excel).
 */
async function actualizarDatatextnow(id, datatextnow_id) {
  const [r] = await pool.query(
    'UPDATE ordenes_compra SET datatextnow_id = ? WHERE id = ?',
    [datatextnow_id, id]
  );
  return r.affectedRows;
}

export { listar, obtenerPorId, crear, cambiarEstado, actualizarDatatextnow };