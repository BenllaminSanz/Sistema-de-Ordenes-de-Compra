import pool from '../config/db.js';

async function listarPorRequerimiento(requerimiento_id, incluirItems = true) {
  const [rows] = await pool.query(`
    SELECT c.*, p.num_proveedor AS proveedor_num, p.nombre AS proveedor_nombre, p.email AS proveedor_email
    FROM cotizaciones c
    JOIN proveedores p ON p.id = c.proveedor_id
    WHERE c.requerimiento_id = ?
    ORDER BY c.created_at ASC`, [requerimiento_id]);

  if (incluirItems && rows.length > 0) {
    // Cargar items para todas las cotizaciones de una sola vez (evita N+1)
    const cotIds = rows.map(r => r.id);
    const [itemsRows] = await pool.query(`
      SELECT cotizacion_id, id, descripcion, codigo_catalogo, catalogo_id, cantidad, unidad, precio_unitario, notas_item
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
    SELECT c.*, 
           p.num_proveedor AS proveedor_num,
           p.nombre AS proveedor_nombre,
           p.email  AS proveedor_email
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
    SELECT id, descripcion, codigo_catalogo, catalogo_id, cantidad, unidad, precio_unitario, notas_item
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
    const idioma = (datos.idioma_correo || 'es').toString().toLowerCase().startsWith('en') ? 'en' : 'es';

    const [result] = await conn.query(`
      INSERT INTO cotizaciones 
        (requerimiento_id, proveedor_id, monto_total, monto_subtotal, iva, moneda,
         archivo_url, fecha_envio, scheduled_at, email_sent_at, idioma_correo, notas, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        datos.requerimiento_id,
        datos.proveedor_id,
        datos.monto_total || 0,
        datos.monto_subtotal || 0,
        datos.iva || 0,
        datos.moneda || 'MXN',
        datos.archivo_url || null,
        datos.fecha_envio || null,
        datos.scheduled_at || null,
        datos.email_sent_at || null,
        idioma,
        datos.notas || null,
        datos.estado || 'en_revision'
      ]);

    const cotizacionId = result.insertId;

    // Insertar items si existen
    if (items && items.length > 0) {
      for (const item of items) {
        const cantidad = Math.max(1, Math.round( parseFloat(item.cantidad) || 1 ));
        const precio = item.precio_unitario != null ? parseFloat(item.precio_unitario) : 0;
        await conn.query(`
          INSERT INTO cotizacion_items 
            (cotizacion_id, descripcion, codigo_catalogo, catalogo_id, cantidad, unidad, precio_unitario, notas_item)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            cotizacionId,
            item.descripcion,
            item.codigo_catalogo || null,
            item.catalogo_id || null,
            cantidad,
            item.unidad || 'pieza',
            isNaN(precio) ? 0 : Math.round(precio * 100) / 100,
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

/**
 * Obtiene todas las cotizaciones pendientes de envío cuya fecha ya llegó.
 */
export async function listarPendientesDeEnvio() {
  const [rows] = await pool.query(`
    SELECT c.*, p.num_proveedor AS proveedor_num, p.nombre AS proveedor_nombre, p.email AS proveedor_email
    FROM cotizaciones c
    JOIN proveedores p ON p.id = c.proveedor_id
    WHERE c.scheduled_at IS NOT NULL
      AND c.scheduled_at <= NOW()
      AND c.email_sent_at IS NULL
    ORDER BY c.scheduled_at ASC
  `);

  return rows;
}

/**
 * Marca una cotización como enviada por correo.
 */
export async function marcarComoEnviadaPorCorreo(cotizacionId) {
  await pool.query(`
    UPDATE cotizaciones 
    SET email_sent_at = NOW(), estado = 'enviada'
    WHERE id = ?
  `, [cotizacionId]);
}

/**
 * Marca una cotización como procesada para email (sin envío real),
 * según reglas de negocio (ej. no corresponde para este tipo de requerimiento).
 * Solo setea email_sent_at para que no se reintente, pero no fuerza estado 'enviada'.
 */
export async function marcarComoProcesadaSinEnvioCorreo(cotizacionId) {
  await pool.query(`
    UPDATE cotizaciones 
    SET email_sent_at = NOW()
    WHERE id = ?
  `, [cotizacionId]);
}

// Actualizar cotización. Si está seleccionada, solo archivo_url y notas (montos/ítems bloqueados en UI).
async function actualizar(id, datos, items = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[verificacion]] = await conn.query(
      'SELECT seleccionada FROM cotizaciones WHERE id = ?',
      [id]
    );

    if (!verificacion) {
      await conn.rollback();
      return 0;
    }

    const camposPermitidosSeleccionada = ['archivo_url', 'notas'];
    const estaSeleccionada = verificacion.seleccionada === 1;
    const camposSolicitados = Object.keys(datos || {});
    const intentaActualizarCamposRestringidos = camposSolicitados.some(
      c => !camposPermitidosSeleccionada.includes(c)
    );

    if (estaSeleccionada && intentaActualizarCamposRestringidos && !items) {
      await conn.rollback();
      return 0;
    }

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

    if (items && Array.isArray(items)) {
      await conn.query('DELETE FROM cotizacion_items WHERE cotizacion_id = ?', [id]);

      for (const item of items) {
        const cantidad = Math.max(1, Math.round( parseFloat(item.cantidad) || 1 ));
        const precio = item.precio_unitario != null ? parseFloat(item.precio_unitario) : 0;
        await conn.query(`
          INSERT INTO cotizacion_items 
            (cotizacion_id, descripcion, codigo_catalogo, catalogo_id, cantidad, unidad, precio_unitario, notas_item)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            item.descripcion,
            item.codigo_catalogo || null,
            item.catalogo_id || null,
            cantidad,
            item.unidad || 'pieza',
            isNaN(precio) ? 0 : Math.round(precio * 100) / 100,
            item.notas_item || null
          ]
        );
      }
    }

    await conn.commit();
    return affected || 1;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/** Marca una cotización como seleccionada y rechaza el resto del requerimiento. */
async function seleccionar(id, requerimiento_id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      'UPDATE cotizaciones SET seleccionada = 0, estado = "rechazada" WHERE requerimiento_id = ? AND id != ?',
      [requerimiento_id, id]
    );

    await conn.query(`
      UPDATE cotizaciones 
      SET seleccionada = 1, 
          estado = 'seleccionada',
          fecha_seleccion = NOW()
      WHERE id = ?`, [id]);

    // El catálogo se formaliza al generar la OC, no aquí.
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function deseleccionar(id, requerimiento_id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(`
      UPDATE cotizaciones 
      SET seleccionada = 0, 
          estado = 'enviada',
          fecha_seleccion = NULL
      WHERE id = ? AND requerimiento_id = ? AND seleccionada = 1
    `, [id, requerimiento_id]);

    if (result.affectedRows === 0) {
      await conn.rollback();
      return false;
    }

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

/** Actualiza solo codigo_catalogo en ítems libres (p. ej. al generar OC). */
async function aplicarCodigosCatalogoItems(cotizacionId, itemsCodigos, conn) {
  if (!Array.isArray(itemsCodigos) || itemsCodigos.length === 0) return;

  for (const row of itemsCodigos) {
    const itemId = parseInt(row?.id, 10);
    const codigo = String(row?.codigo_catalogo || '').trim();
    if (!itemId || !codigo) continue;

    await conn.query(
      `UPDATE cotizacion_items
       SET codigo_catalogo = ?
       WHERE id = ? AND cotizacion_id = ?
         AND (catalogo_id IS NULL OR catalogo_id = 0)`,
      [codigo, itemId, cotizacionId]
    );
  }
}

/** Exige Nº ítem en ítems libres; lanza 422 FALTAN_CODIGOS_CATALOGO con items[]. */
async function assertCodigosCatalogoListos(cotizacionId, conn) {
  const [faltantes] = await conn.query(
    `SELECT id, descripcion, cantidad, unidad
     FROM cotizacion_items
     WHERE cotizacion_id = ?
       AND (catalogo_id IS NULL OR catalogo_id = 0)
       AND (codigo_catalogo IS NULL OR TRIM(codigo_catalogo) = '')
     ORDER BY id ASC`,
    [cotizacionId]
  );

  if (faltantes.length === 0) return;

  const items = faltantes.map(item => ({
    id: item.id,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    unidad: item.unidad || '',
  }));
  const primerDesc = items[0].descripcion || 'sin descripción';

  throw {
    status: 422,
    codigo: 'FALTAN_CODIGOS_CATALOGO',
    mensaje: items.length === 1
      ? `El ítem "${primerDesc}" no tiene Nº ítem. Complétalo para generar la OC; ese código se guardará en el catálogo.`
      : `Hay ${items.length} ítems sin Nº ítem (p. ej. "${primerDesc}"). Complétalos para generar la OC; esos códigos se guardarán en el catálogo.`,
    items,
  };
}

/**
 * Inserta/actualiza en catálogo los ítems de la cotización al generar la OC.
 * Usa codigo_catalogo como código de catálogo y el precio de la cotización como costo_referencia.
 */
async function formalizarCotizacionEnCatalogo(cotizacionId, conn) {
  const [[cot]] = await conn.query(
    `SELECT c.proveedor_id, c.moneda, r.tipo AS req_tipo
     FROM cotizaciones c
     JOIN requerimientos r ON r.id = c.requerimiento_id
     WHERE c.id = ?`,
    [cotizacionId]
  );

  if (!cot) return;

  const [cotItems] = await conn.query(
    `SELECT id, descripcion, codigo_catalogo, catalogo_id, cantidad, unidad, precio_unitario
     FROM cotizacion_items
     WHERE cotizacion_id = ?`,
    [cotizacionId]
  );

  if (cotItems.length === 0) return;

  await assertCodigosCatalogoListos(cotizacionId, conn);

  const tipo = cot.req_tipo || 'PARTES';
  const moneda = cot.moneda || 'MXN';
  const proveedorId = cot.proveedor_id || null;

  async function actualizarCatalogo(catalogoId, datos) {
    await conn.query(
      `UPDATE catalogo
       SET proveedor_id = ?, costo_referencia = ?, moneda = ?,
           descripcion = COALESCE(?, descripcion),
           unidad = COALESCE(?, unidad)
       WHERE id = ?`,
      [
        proveedorId,
        datos.precio_unitario ?? null,
        moneda,
        datos.descripcion || null,
        datos.unidad || null,
        catalogoId,
      ]
    );
  }

  for (const item of cotItems) {
    const codigo = String(item.codigo_catalogo || '').trim();
    const precio = item.precio_unitario != null ? item.precio_unitario : null;
    const unidad = item.unidad || null;

    if (item.catalogo_id) {
      await actualizarCatalogo(item.catalogo_id, item);
      continue;
    }

    const [porCodigo] = await conn.query(
      'SELECT id FROM catalogo WHERE codigo = ? LIMIT 1',
      [codigo]
    );

    if (porCodigo.length > 0) {
      await actualizarCatalogo(porCodigo[0].id, item);
      continue;
    }

    await conn.query(
      `INSERT INTO catalogo (tipo, codigo, descripcion, unidad, costo_referencia, moneda, proveedor_id, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [tipo, codigo, item.descripcion, unidad, precio, moneda, proveedorId]
    );
  }
}

export { 
  listarPorRequerimiento, 
  obtenerPorId, 
  crear, 
  actualizar, 
  seleccionar, 
  deseleccionar,
  eliminar,
  aplicarCodigosCatalogoItems,
  assertCodigosCatalogoListos,
  formalizarCotizacionEnCatalogo
};