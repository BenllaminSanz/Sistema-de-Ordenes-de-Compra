import pool from '../config/db.js';

async function listarPorRequerimiento(requerimiento_id) {
  const [rows] = await pool.query(
    `SELECT c.*, p.nombre AS proveedor_nombre, p.email AS proveedor_email
     FROM cotizaciones c
     JOIN proveedores p ON p.id = c.proveedor_id
     WHERE c.requerimiento_id = ?
     ORDER BY c.created_at ASC`,
    [requerimiento_id]
  );
  return rows;
}

async function obtenerPorId(id) {
  const [[cot]] = await pool.query(
    `SELECT c.*, p.nombre AS proveedor_nombre
     FROM cotizaciones c
     JOIN proveedores p ON p.id = c.proveedor_id
     WHERE c.id = ?`,
    [id]
  );
  return cot || null;
}

async function crear(datos) {
  const [result] = await pool.query(
    `INSERT INTO cotizaciones
       (requerimiento_id, proveedor_id, monto_total, moneda,
        archivo_url, fecha_envio, fecha_recepcion, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.requerimiento_id,
      datos.proveedor_id,
      datos.monto_total,
      datos.moneda      || 'MXN',
      datos.archivo_url || null,
      datos.fecha_envio || null,
      datos.fecha_recepcion || null,
      datos.notas       || null,
    ]
  );
  return result.insertId;
}

async function actualizar(id, datos) {
  const campos = {};
  ['monto_total','moneda','archivo_url','fecha_envio','fecha_recepcion','notas'].forEach(c => {
    if (datos[c] !== undefined) campos[c] = datos[c];
  });
  if (!Object.keys(campos).length) return 0;
  const sets = Object.keys(campos).map(c => `${c} = ?`).join(', ');
  const [r] = await pool.query(
    `UPDATE cotizaciones SET ${sets} WHERE id = ? AND seleccionada = 0`,
    [...Object.values(campos), id]
  );
  return r.affectedRows;
}

/**
 * Seleccionar una cotización: desmarca todas las demás del mismo requerimiento
 * y marca la elegida. Operación en transacción.
 */
async function seleccionar(id, requerimiento_id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      'UPDATE cotizaciones SET seleccionada = 0 WHERE requerimiento_id = ?',
      [requerimiento_id]
    );
    await conn.query(
      'UPDATE cotizaciones SET seleccionada = 1 WHERE id = ?',
      [id]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function eliminar(id) {
  const [r] = await pool.query(
    'DELETE FROM cotizaciones WHERE id = ? AND seleccionada = 0',
    [id]
  );
  return r.affectedRows;
}

async function getByRequerimiento(requerimientoId) {
    const [rows] = await pool.execute(`
      SELECT c.*, p.nombre as proveedor_nombre 
      FROM cotizaciones c
      JOIN proveedores p ON c.proveedor_id = p.id
      WHERE c.requerimiento_id = ?
      ORDER BY c.monto_total ASC
    `, [requerimientoId]);
    return rows;
  }

  async function marcarComoSeleccionada(id) {
    // Desmarcar todas las demás del mismo requerimiento
    const [cotizacion] = await pool.execute('SELECT requerimiento_id FROM cotizaciones WHERE id = ?', [id]);
    if (cotizacion.length === 0) throw new Error('Cotización no encontrada');

    await pool.execute('UPDATE cotizaciones SET seleccionada = 0 WHERE requerimiento_id = ?', [cotizacion[0].requerimiento_id]);
    await pool.execute('UPDATE cotizaciones SET seleccionada = 1 WHERE id = ?', [id]);
    return true;
  }

export { listarPorRequerimiento, obtenerPorId, crear, actualizar, seleccionar, eliminar, getByRequerimiento, marcarComoSeleccionada};