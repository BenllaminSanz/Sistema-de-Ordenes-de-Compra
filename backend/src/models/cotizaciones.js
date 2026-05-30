// backend/src/models/cotizaciones.js
import pool from '../config/db.js';

async function listarPorRequerimiento(requerimiento_id, incluirItems = true) {
  const [rows] = await pool.query(`
    SELECT c.*, p.nombre AS proveedor_nombre, p.email AS proveedor_email
    FROM cotizaciones c
    JOIN proveedores p ON p.id = c.proveedor_id
    WHERE c.requerimiento_id = ?
    ORDER BY c.created_at ASC`, [requerimiento_id]);

  if (incluirItems && rows.length > 0) {
    // Cargar items para todas las cotizaciones de una sola vez (evita N+1)
    const cotIds = rows.map(r => r.id);
    const [itemsRows] = await pool.query(`
      SELECT cotizacion_id, id, descripcion, cantidad, unidad, precio_unitario, notas_item
      FROM cotizacion_items
      WHERE cotizacion_id IN (?)
      ORDER BY cotizacion_id, id ASC
    `, [cotIds]);

    // Agrupar items por cotizacion_id
    const itemsPorCot = {};
    for (const item of itemsRows) {
      if (!itemsPorCot[item.cotizacion_id]) itemsPorCot[item.cotizacion_id] = [];
      itemsPorCot[item.cotizacion_id].push(item);
    }

    // Asignar a cada cotización
    for (const cot of rows) {
      cot.items = itemsPorCot[cot.id] || [];
    }
  } else {
    for (const cot of rows) {
      cot.items = [];
    }
  }

  return rows;
}

async function obtenerPorId(id) {
  const [[cot]] = await pool.query(`
    SELECT c.*, p.nombre AS proveedor_nombre
    FROM cotizaciones c
    JOIN proveedores p ON p.id = c.proveedor_id
    WHERE c.id = ?`, [id]);

  if (!cot) return null;

  // Cargar items asociados
  cot.items = await listarItems(id);
  return cot;
}

async function listarItems(cotizacion_id) {
  const [rows] = await pool.query(`
    SELECT id, descripcion, cantidad, unidad, precio_unitario, notas_item
    FROM cotizacion_items
    WHERE cotizacion_id = ?
    ORDER BY id ASC
  `, [cotizacion_id]);
  return rows;
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
// Soporta reemplazo de items si se pasa el arreglo 'items'
async function actualizar(id, datos, items = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Verificar que no esté seleccionada
    const [[verificacion]] = await conn.query(
      'SELECT seleccionada FROM cotizaciones WHERE id = ?',
      [id]
    );

    if (!verificacion) {
      await conn.rollback();
      return 0; // No existe
    }
    if (verificacion.seleccionada === 1) {
      await conn.rollback();
      return 0; // No se puede editar si ya está seleccionada
    }

    // 2. Actualizar campos del encabezado
    const campos = {};
    ['monto_total', 'monto_subtotal', 'iva', 'moneda', 'archivo_url', 'fecha_envio', 'fecha_recepcion', 'notas', 'estado'].forEach(c => {
      if (datos[c] !== undefined) campos[c] = datos[c];
    });

    let affected = 0;
    if (Object.keys(campos).length > 0) {
      const sets = Object.keys(campos).map(c => `${c} = ?`).join(', ');
      const [r] = await conn.query(
        `UPDATE cotizaciones SET ${sets} WHERE id = ?`,
        [...Object.values(campos), id]
      );
      affected = r.affectedRows;
    }

    // 3. Reemplazar items si se proporcionaron
    if (items && Array.isArray(items)) {
      // Eliminar items anteriores
      await conn.query('DELETE FROM cotizacion_items WHERE cotizacion_id = ?', [id]);

      // Insertar los nuevos
      for (const item of items) {
        await conn.query(`
          INSERT INTO cotizacion_items 
            (cotizacion_id, descripcion, cantidad, unidad, precio_unitario, notas_item)
          VALUES (?, ?, ?, ?, ?, ?)`,
          [
            id,
            item.descripcion,
            item.cantidad || 1,
            item.unidad || 'pieza',
            item.precio_unitario || 0,
            item.notas_item || null
          ]
        );
      }
    }

    await conn.commit();
    return affected || 1; // Si solo se actualizaron items, devolvemos 1 como éxito
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
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