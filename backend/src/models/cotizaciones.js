// backend/src/models/cotizaciones.js
import pool from '../config/db.js';

async function listarPorRequerimiento(requerimiento_id) {
  const [rows] = await pool.query(`
    SELECT c.*, p.nombre AS proveedor_nombre, p.email AS proveedor_email
    FROM cotizaciones c
    JOIN proveedores p ON p.id = c.proveedor_id
    WHERE c.requerimiento_id = ?
    ORDER BY c.created_at ASC`, [requerimiento_id]);
  return rows;
}

async function obtenerPorId(id) {
  const [[cot]] = await pool.query(`
    SELECT c.*, p.nombre AS proveedor_nombre
    FROM cotizaciones c
    JOIN proveedores p ON p.id = c.proveedor_id
    WHERE c.id = ?`, [id]);
  return cot || null;
}

async function crear(datos, items = []) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Crear cotización principal
    const [result] = await conn.query(`
      INSERT INTO cotizaciones 
        (requerimiento_id, proveedor_id, monto_total, monto_subtotal, iva, moneda,
         archivo_url, fecha_envio, notas, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'enviada')`,
      [
        datos.requerimiento_id,
        datos.proveedor_id,
        datos.monto_total || 0,
        datos.monto_subtotal || 0,
        datos.iva || 0,
        datos.moneda || 'MXN',
        datos.archivo_url || null,
        datos.fecha_envio || null,
        datos.notas || null
      ]);

    const cotizacionId = result.insertId;

    // Insertar items si existen
    if (items && items.length > 0) {
      for (const item of items) {
        await conn.query(`
          INSERT INTO cotizacion_items 
            (cotizacion_id, descripcion, cantidad, unidad, precio_unitario, notas_item)
          VALUES (?, ?, ?, ?, ?, ?)`,
          [
            cotizacionId,
            item.descripcion,
            item.cantidad || 1,
            item.unidad || 'pieza',
            item.precio_unitario,
            item.notas_item || null
          ]);
      }
    }

    await conn.commit();
    return cotizacionId;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// Actualizar manteniendo restricción de no modificar si ya está seleccionada
async function actualizar(id, datos) {
  const campos = {};
  ['monto_total', 'moneda', 'archivo_url', 'fecha_envio', 'fecha_recepcion', 'notas', 'estado'].forEach(c => {
    if (datos[c] !== undefined) campos[c] = datos[c];
  });

  if (!Object.keys(campos).length) return 0;

  const sets = Object.keys(campos).map(c => `${c} = ?`).join(', ');
  const [r] = await pool.query(
    `UPDATE cotizaciones SET ${sets} 
     WHERE id = ? AND seleccionada = 0`,
    [...Object.values(campos), id]
  );
  return r.affectedRows;
}

/**
 * Seleccionar una cotización - MEJORADA
 * Desmarca todas las demás y marca la seleccionada + actualiza estado y fecha
 */
async function seleccionar(id, requerimiento_id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Desmarcar todas
    await conn.query(
      'UPDATE cotizaciones SET seleccionada = 0, estado = "rechazada" WHERE requerimiento_id = ? AND id != ?',
      [requerimiento_id, id]
    );

    // Marcar la seleccionada
    await conn.query(`
      UPDATE cotizaciones 
      SET seleccionada = 1, 
          estado = 'seleccionada',
          fecha_seleccion = NOW()
      WHERE id = ?`, [id]);

    await conn.commit();
    return true;
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

export { 
  listarPorRequerimiento, 
  obtenerPorId, 
  crear, 
  actualizar, 
  seleccionar, 
  eliminar 
};