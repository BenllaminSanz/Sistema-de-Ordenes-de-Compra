import pool from '../config/db.js';
import { validarAreaDepartamento, obtenerAreas } from '../config/departamentosStore.js';
import { obtenerSiguienteConsecutivo } from '../utils/consecutivos.js';

// ─── Consultas ────────────────────────────────────────────────────────────────

/**
 * Listar requerimientos con filtros opcionales y paginación.
 * filtros: { estado, tipo, solicitante_id, busqueda, pagina, limite }
 */
async function listar(filtros = {}) {
  const { estado, area, departamento, tipo, solicitante_id, busqueda, pagina = 1, limite = 20 } = filtros;

  let where = [];
  let params = [];

  if (estado) {
    const estados = String(estado).split(',').map(s => s.trim()).filter(Boolean);
    if (estados.length === 1) {
      where.push('r.estado = ?');
      params.push(estados[0]);
    } else if (estados.length > 1) {
      where.push(`r.estado IN (${estados.map(() => '?').join(',')})`);
      params.push(...estados);
    }
  }
  if (area)           { where.push('r.area = ?');                       params.push(area); }
  if (departamento)   { where.push('r.departamento = ?');               params.push(departamento); }
  if (tipo)           { where.push('r.tipo = ?');                       params.push(tipo); }
  if (solicitante_id) { where.push('r.solicitante_id = ?');             params.push(solicitante_id); }
  if (busqueda)       { where.push('(r.consecutivo LIKE ? OR r.notas LIKE ?)');
                        params.push(`%${busqueda}%`, `%${busqueda}%`); }

  const clausulaWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (pagina - 1) * limite;

  const [rows] = await pool.query(
    `SELECT
       r.id, r.consecutivo, r.titulo_solicitud, r.area, r.departamento, r.tipo, r.estado,
       r.requiere_cotizacion, r.notas,
       r.datatextnow_id, r.notas_rechazo,
       r.orden_compra_id,
       oc.numero_oc AS oc_numero,
       oc.estado    AS oc_estado,
       oc.id        AS oc_id,
       r.created_at, r.updated_at,
       u.nombre AS solicitante_nombre,
       u.email  AS solicitante_email
     FROM requerimientos r
     JOIN usuarios u ON u.id = r.solicitante_id
     LEFT JOIN ordenes_compra oc ON oc.id = r.orden_compra_id
     ${clausulaWhere}
     ORDER BY r.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limite), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM requerimientos r ${clausulaWhere}`,
    params
  );

  return { datos: rows, total, pagina: Number(pagina), limite: Number(limite) };
}

/**
 * Obtener un requerimiento por ID, incluyendo su historial de estados.
 */
async function obtenerPorId(id) {
  const [[req]] = await pool.query(
    `SELECT
       r.*,
       u.nombre AS solicitante_nombre,
       u.email  AS solicitante_email,
       oc.numero_oc AS oc_numero,
       oc.estado    AS oc_estado,
       oc.id        AS oc_id,
       oc.monto_total AS oc_monto_total,
       oc.moneda      AS oc_moneda,
       oc.datatextnow_id AS oc_datatextnow_id
     FROM requerimientos r
     JOIN usuarios u ON u.id = r.solicitante_id
     LEFT JOIN ordenes_compra oc ON oc.id = r.orden_compra_id
     WHERE r.id = ?`,
    [id]
  );

  if (!req) return null;

  const [historial] = await pool.query(
    `SELECT
       h.estado_anterior, h.estado_nuevo,
       h.notas, h.created_at,
       u.nombre AS cambiado_por
     FROM historial_estados h
     JOIN usuarios u ON u.id = h.cambiado_por
     WHERE h.entidad_tipo = 'requerimiento' AND h.entidad_id = ?
     ORDER BY h.created_at ASC`,
    [id]
  );

  // Cargar ítems del catálogo asociados (estructurados)
  const [items] = await pool.query(
    `SELECT 
       ri.id,
       ri.catalogo_id,
       ri.cantidad,
       c.codigo,
       c.descripcion,
       c.tipo,
       c.unidad,
       c.costo_referencia,
       c.moneda,
       c.proveedor_id,
       p.num_proveedor as proveedor_num,
       p.nombre as proveedor_nombre
     FROM requerimiento_items ri
     JOIN catalogo c ON c.id = ri.catalogo_id
     LEFT JOIN proveedores p ON p.id = c.proveedor_id
     WHERE ri.requerimiento_id = ?
     ORDER BY ri.id ASC`,
    [id]
  );

  // Cargar ítems en texto libre (cuando no existen en el catálogo aún)
  const [itemsLibres] = await pool.query(
    `SELECT
       ril.id,
       ril.descripcion,
       ril.cantidad,
       ril.unidad,
       ril.notas,
       ril.referencia_tipo,
       ril.referencia_url,
       ril.referencia_nombre,
       ril.catalogo_asignado_id,
       c.codigo AS catalogo_codigo,
       c.descripcion AS catalogo_descripcion_asignada
     FROM requerimiento_items_libres ril
     LEFT JOIN catalogo c ON c.id = ril.catalogo_asignado_id
     WHERE ril.requerimiento_id = ?
     ORDER BY ril.id ASC`,
    [id]
  );

  // Intentar obtener código del departamento — primero validación exacta,
  // luego fallback case-insensitive para datos históricos importados en mayúsculas.
  const valDepto = await validarAreaDepartamento(req.area, req.departamento);
  if (valDepto.ok && valDepto.departamento?.codigo) {
    req.departamento_codigo = valDepto.departamento.codigo;
  } else if (req.area && req.departamento) {
    const areas = await obtenerAreas();
    const areaKey = String(req.area || '').trim().toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const area = areas.find((a) => {
      const idKey = String(a.id || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const labKey = String(a.label || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return idKey === areaKey || labKey === areaKey;
    });
    if (area) {
      const deptoNorm = String(req.departamento).trim().toUpperCase();
      const depto = (area.departamentos || []).find(
        d => String(d.nombre).trim().toUpperCase() === deptoNorm
      );
      if (depto?.codigo) req.departamento_codigo = depto.codigo;
    }
  }

  const [[cotSel]] = await pool.query(
    `SELECT
       c.id AS cotizacion_id,
       c.monto_total AS cotizacion_monto,
       c.moneda AS cotizacion_moneda,
       c.proveedor_id,
       p.num_proveedor AS proveedor_num,
       p.nombre AS proveedor_nombre
     FROM cotizaciones c
     JOIN proveedores p ON p.id = c.proveedor_id
     WHERE c.requerimiento_id = ?
       AND (c.seleccionada = 1 OR c.estado = 'seleccionada')
     LIMIT 1`,
    [id]
  );

  return {
    ...req,
    historial,
    items,
    items_libres: itemsLibres,
    proveedor_seleccionado: cotSel || null,
  };
}

/**
 * Crear un nuevo requerimiento dentro de una transacción.
 * Genera el consecutivo y registra el primer estado en historial.
 *
 * Reintenta ante deadlock: cuando dos requerimientos del mismo año+tipo se crean
 * simultáneamente por primera vez, InnoDB puede reportar ER_LOCK_DEADLOCK al
 * competir por la fila nueva en consecutivos_control (comportamiento normal de
 * locks de InnoDB, no indica datos corruptos). Reintentar la transacción completa
 * resuelve el conflicto sin generar consecutivos duplicados ni fallar la petición.
 */
/** Máximo de líneas/ítems por requerimiento (impresión y operación). */
const MAX_ITEMS_POR_REQ = 15;

function contarItemsPayload(datos) {
  const nCat = Array.isArray(datos.items) ? datos.items.filter((i) => i?.catalogo_id && (i.cantidad || 0) > 0).length : 0;
  const nLib = Array.isArray(datos.items_libres) ? datos.items_libres.filter((i) => i?.descripcion && (i.cantidad || 0) > 0).length : 0;
  return nCat + nLib;
}

function assertLimiteItems(datos) {
  const total = contarItemsPayload(datos);
  if (total > MAX_ITEMS_POR_REQ) {
    throw {
      status: 422,
      mensaje: `Máximo ${MAX_ITEMS_POR_REQ} ítems por requerimiento. Tienes ${total}. Crea otro REQ para el resto.`,
    };
  }
}

async function crear(datos, solicitante_id, intento = 1) {
  const MAX_INTENTOS = 6;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    assertLimiteItems(datos);

    // El consecutivo formal se asigna al enviar a revisión (no en borrador)
    const consecutivo = null;

    const tieneLibresEnDatos = Array.isArray(datos.items_libres) && datos.items_libres.length > 0;
    const requiereCotEnBD = tieneLibresEnDatos ? 1 : (datos.requiere_cotizacion ? 1 : 0);

    const [result] = await conn.query(
      `INSERT INTO requerimientos
         (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'borrador')`,
      [
        consecutivo,
        solicitante_id,
        datos.titulo_solicitud,
        datos.area,
        datos.departamento,
        datos.tipo,
        datos.notas || datos.descripcion || '', // compatibilidad con datos antiguos (antes 'descripcion')
        requiereCotEnBD,
      ]
    );

    const requerimientoId = result.insertId;

    // Registrar estado inicial en historial
    await conn.query(
      `INSERT INTO historial_estados
         (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
       VALUES ('requerimiento', ?, NULL, 'borrador', ?, 'Requerimiento creado como borrador')`,
      [requerimientoId, solicitante_id]
    );

    const tieneItems = Array.isArray(datos.items) && datos.items.length > 0;
    const tieneLibres = Array.isArray(datos.items_libres) && datos.items_libres.length > 0;

    if (tieneItems && tieneLibres) {
      throw new Error('No se puede mezclar ítems del catálogo con ítems libres en el mismo requerimiento');
    }

    // Insertar ítems del catálogo si se enviaron
    if (tieneItems) {
      for (const item of datos.items) {
        if (item.catalogo_id && item.cantidad > 0) {
          const cantidad = Math.max(1, Math.round( parseFloat(item.cantidad) || 1 ));
          await conn.query(
            `INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad)
             VALUES (?, ?, ?)`,
            [requerimientoId, item.catalogo_id, cantidad]
          );
        }
      }
    }

    // Insertar ítems en texto libre (no existen en catálogo) si se enviaron
    if (tieneLibres) {
      for (const item of datos.items_libres) {
        if (item && item.descripcion && (item.cantidad || 0) > 0) {
          const cantidad = Math.max(1, Math.round( parseFloat(item.cantidad) || 1 ));
          await conn.query(
            `INSERT INTO requerimiento_items_libres
               (requerimiento_id, descripcion, cantidad, unidad, notas, referencia_tipo, referencia_url, referencia_nombre)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              requerimientoId,
              item.descripcion,
              cantidad,
              item.unidad || null,
              item.notas || null,
              item.referencia_tipo || null,
              item.referencia_url || null,
              item.referencia_nombre || null
            ]
          );
        }
      }
    }

    await conn.commit();
    return requerimientoId;
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_LOCK_DEADLOCK' && intento < MAX_INTENTOS) {
      await new Promise((r) => setTimeout(r, 10 + Math.random() * 40 * intento));
      return crear(datos, solicitante_id, intento + 1);
    }
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Actualizar campos editables de un requerimiento.
 * Solo permitido cuando estado = 'borrador' o 'incompleto'.
 * Soporta reemplazo de:
 *   - ítems del catálogo (arreglo 'items')
 *   - ítems en texto libre (arreglo 'items_libres') - para cuando aún no existen en catálogo
 */
async function actualizar(id, datos, items = null, itemsLibres = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Verificar existencia y que el estado permita edición
    const [[actual]] = await conn.query(
      'SELECT estado FROM requerimientos WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!actual) {
      await conn.rollback();
      return 0;
    }
    if (!['borrador', 'incompleto'].includes(actual.estado)) {
      await conn.rollback();
      return 0;
    }

    if (Array.isArray(items) || Array.isArray(itemsLibres)) {
      assertLimiteItems({
        items: Array.isArray(items) ? items : [],
        items_libres: Array.isArray(itemsLibres) ? itemsLibres : [],
      });
    }

    // 1. Actualizar campos escalares (si hay)
    const campos = {};
    if (datos.titulo_solicitud        !== undefined) campos.titulo_solicitud        = datos.titulo_solicitud;
    if (datos.area                    !== undefined) campos.area                    = datos.area;
    if (datos.departamento            !== undefined) campos.departamento            = datos.departamento;
    if (datos.tipo        !== undefined) campos.tipo        = datos.tipo;
    if (datos.notas !== undefined) campos.notas = datos.notas;
    if (datos.descripcion !== undefined) campos.notas = datos.descripcion; // compat datos antiguos (renombre a notas)
    if (datos.requiere_cotizacion !== undefined)
      campos.requiere_cotizacion = datos.requiere_cotizacion ? 1 : 0;
    if (datos.datatextnow_id !== undefined) campos.datatextnow_id = datos.datatextnow_id; // PO de DataTextNow

    let affected = 0;
    if (Object.keys(campos).length > 0) {
      const sets    = Object.keys(campos).map(c => `${c} = ?`).join(', ');
      const valores = [...Object.values(campos), id];
      const [result] = await conn.query(
        `UPDATE requerimientos SET ${sets} WHERE id = ? AND estado IN ('borrador','incompleto')`,
        valores
      );
      affected = result.affectedRows;
    }

    const tieneItems = Array.isArray(items) && items.length > 0;
    const tieneLibres = Array.isArray(itemsLibres) && itemsLibres.length > 0;

    if (tieneItems && tieneLibres) {
      await conn.rollback();
      throw new Error('No se puede mezclar ítems del catálogo con ítems libres en el mismo requerimiento');
    }

    // 2. Reemplazar ítems del catálogo si se proporcionó el arreglo (incluye [] para limpiar)
    if (Array.isArray(items)) {
      await conn.query('DELETE FROM requerimiento_items WHERE requerimiento_id = ?', [id]);

      for (const item of items) {
        if (item && item.catalogo_id && (item.cantidad || 0) > 0) {
          const cantidad = Math.max(1, Math.round( parseFloat(item.cantidad) || 1 ));
          await conn.query(
            `INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad)
             VALUES (?, ?, ?)`,
            [id, item.catalogo_id, cantidad]
          );
        }
      }
      if (affected === 0) affected = 1;
    }

    // 3. Reemplazar ítems en texto libre si se proporcionó el arreglo
    if (Array.isArray(itemsLibres)) {
      await conn.query('DELETE FROM requerimiento_items_libres WHERE requerimiento_id = ?', [id]);

      for (const item of itemsLibres) {
        if (item && item.descripcion && (item.cantidad || 0) > 0) {
          const cantidad = Math.max(1, Math.round( parseFloat(item.cantidad) || 1 ));
          await conn.query(
            `INSERT INTO requerimiento_items_libres
               (requerimiento_id, descripcion, cantidad, unidad, notas, referencia_tipo, referencia_url, referencia_nombre)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              item.descripcion,
              cantidad,
              item.unidad || null,
              item.notas || null,
              item.referencia_tipo || null,
              item.referencia_url || null,
              item.referencia_nombre || null
            ]
          );
        }
      }
      if (affected === 0) affected = 1;
    }

    // Consistencia de requiere_cotizacion según ítems (derivado de presencia de libres vs catálogo)
    const finalTieneLibres = Array.isArray(itemsLibres) ? (itemsLibres.length > 0) : null;
    const finalTieneItems = Array.isArray(items) ? (items.length > 0) : null;
    if (finalTieneLibres === true) {
      await conn.query('UPDATE requerimientos SET requiere_cotizacion = 1 WHERE id = ?', [id]);
    } else if (finalTieneItems === true && finalTieneLibres === false) {
      await conn.query('UPDATE requerimientos SET requiere_cotizacion = 0 WHERE id = ?', [id]);
    }

    await conn.commit();
    return affected;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Cambiar el estado de un requerimiento y registrar en historial.
 * estadosPermitidos define las transiciones válidas por estado origen.
 */
const TRANSICIONES = {
  borrador:    ['en_revision'],
  en_revision: ['aprobado', 'incompleto', 'rechazado'],
  incompleto:  ['en_revision'],
  aprobado:    ['cerrado', 'rechazado'],
  rechazado:   [],
  cerrado:     [],
};

async function cambiarEstado(id, nuevoEstado, usuarioId, notas = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[req]] = await conn.query(
      'SELECT id, estado, tipo, consecutivo FROM requerimientos WHERE id = ? FOR UPDATE',
      [id]
    );

    if (!req) throw { status: 404, mensaje: 'Requerimiento no encontrado' };

    const permitidos = TRANSICIONES[req.estado] || [];
    if (!permitidos.includes(nuevoEstado)) {
      throw {
        status: 422,
        mensaje: `No se puede pasar de '${req.estado}' a '${nuevoEstado}'`,
      };
    }

    // Asignar consecutivo formal solo al primer envío a revisión
    let consecutivo = req.consecutivo;
    if (nuevoEstado === 'en_revision' && !consecutivo) {
      consecutivo = await obtenerSiguienteConsecutivo(conn, req.tipo);
    }

    await conn.query(
      `UPDATE requerimientos
       SET estado = ?, notas_rechazo = ?, consecutivo = ?
       WHERE id = ?`,
      [nuevoEstado, notas, consecutivo, id]
    );

    const notasHist = nuevoEstado === 'en_revision' && !req.consecutivo && consecutivo
      ? `${notas ? notas + ' — ' : ''}Consecutivo asignado: ${consecutivo}`
      : notas;

    await conn.query(
      `INSERT INTO historial_estados
         (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
       VALUES ('requerimiento', ?, ?, ?, ?, ?)`,
      [id, req.estado, nuevoEstado, usuarioId, notasHist]
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
 * Eliminar un requerimiento solo si está en estado 'borrador'.
 * options.solicitante_id: si se indica, solo el dueño puede borrar.
 * options.rol: admin/contabilidad pueden borrar cualquier borrador.
 */
async function eliminar(id, { solicitante_id = null, rol = null } = {}) {
  const [[req]] = await pool.query(
    'SELECT id, estado, solicitante_id, consecutivo FROM requerimientos WHERE id = ?',
    [id]
  );
  if (!req) return 0;
  if (req.estado !== 'borrador') {
    throw {
      status: 422,
      mensaje: 'Solo se pueden eliminar requerimientos en estado borrador (aún no enviados a revisión).',
    };
  }
  if (rol !== 'admin' && rol !== 'contabilidad') {
    if (!solicitante_id || req.solicitante_id !== solicitante_id) {
      throw { status: 403, mensaje: 'Solo el solicitante puede eliminar su propio borrador' };
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM requerimiento_items WHERE requerimiento_id = ?', [id]);
    await conn.query('DELETE FROM requerimiento_items_libres WHERE requerimiento_id = ?', [id]);
    await conn.query(
      `DELETE FROM historial_estados WHERE entidad_tipo = 'requerimiento' AND entidad_id = ?`,
      [id]
    );
    const [result] = await conn.query(
      "DELETE FROM requerimientos WHERE id = ? AND estado = 'borrador'",
      [id]
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

async function asignarCatalogoAItemLibre(requerimientoId, libreId, catalogoId) {
  const [[item]] = await pool.query(
    `SELECT id FROM requerimiento_items_libres WHERE id = ? AND requerimiento_id = ?`,
    [libreId, requerimientoId]
  );
  if (!item) throw { status: 404, mensaje: 'Ítem libre no encontrado en este requerimiento' };

  if (catalogoId != null) {
    const [[cat]] = await pool.query(
      `SELECT id FROM catalogo WHERE id = ? AND activo = 1`,
      [catalogoId]
    );
    if (!cat) throw { status: 404, mensaje: 'Ítem del catálogo no encontrado o inactivo' };
  }

  await pool.query(
    `UPDATE requerimiento_items_libres SET catalogo_asignado_id = ? WHERE id = ?`,
    [catalogoId ?? null, libreId]
  );
}

export {
  listar,
  obtenerPorId,
  crear,
  actualizar,
  cambiarEstado,
  eliminar,
  asignarCatalogoAItemLibre,
  MAX_ITEMS_POR_REQ,
};