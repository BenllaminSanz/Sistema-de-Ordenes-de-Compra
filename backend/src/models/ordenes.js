import pool from '../config/db.js';
import * as Catalogo from './catalogo.js';
import { formalizarCotizacionEnCatalogo } from './cotizaciones.js';
import { validarCierreOrden } from '../utils/ocCierre.js';
import { calcularTotalesCatalogoRequerimiento } from '../utils/catalogoItems.js';

/** Usa el consecutivo del requerimiento sin prefijo REQ- (ej. REQ-2026S-001 → 2026S-001). */
async function generarNumeroOC(conn, requerimiento_id) {
  const [[req]] = await conn.query(
    'SELECT consecutivo FROM requerimientos WHERE id = ?',
    [requerimiento_id]
  );

  if (req?.consecutivo) {
    return req.consecutivo.replace(/^REQ-/i, '');
  }

  const anio = new Date().getFullYear();
  const prefijo = `${anio}-`;
  const [rows] = await conn.query(
    `SELECT numero_oc FROM ordenes_compra
     WHERE numero_oc LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefijo}%`]
  );
  if (!rows.length) return `${prefijo}0001`;
  const ultimo = parseInt(rows[0].numero_oc.split('-').pop(), 10) || 0;
  return `${prefijo}${String(ultimo + 1).padStart(4, '0')}`;
}

const ESTADOS_OC_ACTIVAS = ['generada', 'distribuida', 'en_proceso', 'recibida'];

async function listar(filtros = {}) {
  const {
    estado,
    tipo,
    busqueda,
    sin_po,
    solicitante_id,
    fecha_desde,
    fecha_hasta,
    pagina = 1,
    limite = 20,
  } = filtros;

  let where = [];
  let params = [];
  const soloActivas = estado === 'activas';

  if (soloActivas) {
    where.push(`oc.estado IN (${ESTADOS_OC_ACTIVAS.map(() => '?').join(', ')})`);
    params.push(...ESTADOS_OC_ACTIVAS);
  } else if (estado) {
    where.push('oc.estado = ?');
    params.push(estado);
  }

  if (tipo) {
    where.push('r.tipo = ?');
    params.push(tipo);
  }

  if (sin_po === 'true' || sin_po === true || sin_po === '1') {
    where.push("(oc.datatextnow_id IS NULL OR TRIM(oc.datatextnow_id) = '')");
  }

  if (busqueda) {
    const like = `%${String(busqueda).trim()}%`;
    where.push(`(
      oc.numero_oc LIKE ? OR oc.datatextnow_id LIKE ? OR r.consecutivo LIKE ?
      OR p.nombre LIKE ? OR p.num_proveedor LIKE ?
    )`);
    params.push(like, like, like, like, like);
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
  const joinsFiltro = `
     JOIN requerimientos r ON r.id = oc.requerimiento_id
     LEFT JOIN cotizaciones c ON c.id = oc.cotizacion_id
     LEFT JOIN proveedores p ON p.id = COALESCE(oc.proveedor_id, c.proveedor_id)`;
  const offset = (pagina - 1) * limite;

  const [rows] = await pool.query(
    `SELECT
       oc.id, oc.numero_oc, oc.estado,
       oc.fecha_autorizacion, oc.datatextnow_id,
       oc.created_at,
       r.consecutivo, r.tipo, r.notas AS descripcion, r.solicitante_id,
       u.nombre AS autorizado_por_nombre,
       sol.nombre AS solicitante_nombre,
       p.num_proveedor AS proveedor_num,
       p.nombre AS proveedor_nombre,
       COALESCE(oc.monto_total, c.monto_total) AS monto_total,
       COALESCE(oc.moneda, c.moneda, 'MXN') AS moneda,
       rec.estado AS estado_recepcion,
       rec.fecha_recepcion
     FROM ordenes_compra oc
     JOIN requerimientos r ON r.id = oc.requerimiento_id
     JOIN usuarios u       ON u.id = oc.autorizado_por
     LEFT JOIN usuarios sol ON sol.id = r.solicitante_id
     LEFT JOIN cotizaciones c ON c.id = oc.cotizacion_id
     LEFT JOIN proveedores  p ON p.id = COALESCE(
       oc.proveedor_id,
       c.proveedor_id,
       (SELECT cat.proveedor_id FROM requerimiento_items ri
        JOIN catalogo cat ON cat.id = ri.catalogo_id
        WHERE ri.requerimiento_id = oc.requerimiento_id
          AND cat.proveedor_id IS NOT NULL
        LIMIT 1)
     )
     LEFT JOIN recepciones rec ON rec.orden_compra_id = oc.id
     ${whereClause}
     ORDER BY ${soloActivas
       ? '(oc.datatextnow_id IS NULL OR oc.datatextnow_id = \'\') DESC, oc.created_at ASC'
       : 'oc.created_at DESC'}
     LIMIT ? OFFSET ?`,
    [...params, Number(limite), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(DISTINCT oc.id) AS total
     FROM ordenes_compra oc
     ${joinsFiltro}
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
       p.num_proveedor AS proveedor_num,
       p.nombre  AS proveedor_nombre,
       COALESCE(oc.monto_total, c.monto_total) AS monto_total,
       COALESCE(oc.moneda, c.moneda, 'MXN') AS moneda,
       c.archivo_url
     FROM ordenes_compra oc
     JOIN requerimientos r ON r.id = oc.requerimiento_id
     JOIN usuarios u       ON u.id = oc.autorizado_por
     LEFT JOIN usuarios s  ON s.id = r.solicitante_id
     LEFT JOIN cotizaciones c ON c.id = oc.cotizacion_id
     LEFT JOIN proveedores  p ON p.id = COALESCE(
       oc.proveedor_id,
       c.proveedor_id,
       (SELECT cat.proveedor_id FROM requerimiento_items ri
        JOIN catalogo cat ON cat.id = ri.catalogo_id
        WHERE ri.requerimiento_id = oc.requerimiento_id
          AND cat.proveedor_id IS NOT NULL
        LIMIT 1)
     )
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

  // Cargar ítems/líneas de la OC:
  // - Si tiene cotizacion_id: usar los items de esa cotización (con precios pactados)
  // - Si no (caso catálogo directo): usar los ítems del requerimiento (catálogo con costo_referencia o libres)
  let items = [];
  if (oc.cotizacion_id) {
    const [cotItems] = await pool.query(`
      SELECT ci.id, ci.descripcion, ci.cantidad, ci.unidad, ci.precio_unitario, ci.notas_item
      FROM cotizacion_items ci
      WHERE ci.cotizacion_id = ?
      ORDER BY ci.id ASC
    `, [oc.cotizacion_id]);
    items = cotItems.map(it => ({ ...it, origen: 'cotizacion' }));
  } else {
    const [catItems] = await pool.query(`
      SELECT ri.id, ri.catalogo_id, c.codigo, c.descripcion, c.unidad, ri.cantidad,
             c.costo_referencia AS precio_unitario_referencia, 'catalogo' AS origen,
             c.proveedor_id, p.num_proveedor AS proveedor_num, p.nombre AS proveedor_nombre
      FROM requerimiento_items ri
      JOIN catalogo c ON c.id = ri.catalogo_id
      LEFT JOIN proveedores p ON p.id = c.proveedor_id
      WHERE ri.requerimiento_id = ?
      ORDER BY ri.id ASC
    `, [oc.requerimiento_id]);
    if (catItems.length > 0) {
      items = catItems;
    } else {
      const [libItems] = await pool.query(`
        SELECT id, descripcion, cantidad, unidad, NULL AS precio_unitario_referencia, 'libres' AS origen
        FROM requerimiento_items_libres
        WHERE requerimiento_id = ?
        ORDER BY id ASC
      `, [oc.requerimiento_id]);
      items = libItems;
    }
  }

  return { ...oc, historial, items };
}

async function crear(requerimiento_id, cotizacion_id, autorizado_por, notas = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const numero_oc = await generarNumeroOC(conn, requerimiento_id);

    // Heredar proveedor, monto_total y moneda de la cotización (si existe).
    // Si no hay cotización, derivar del catálogo del requerimiento (costos de referencia).
    let proveedor_id = null;
    let monto_total = null;
    let moneda = 'MXN';

    if (cotizacion_id) {
      const [[cot]] = await conn.query(
        `SELECT proveedor_id, monto_total, moneda FROM cotizaciones WHERE id = ?`,
        [cotizacion_id]
      );
      if (cot) {
        proveedor_id = cot.proveedor_id || null;
        monto_total = cot.monto_total || null;
        moneda = cot.moneda || 'MXN';
      }
    } else {
      const totalesCat = await calcularTotalesCatalogoRequerimiento(requerimiento_id, conn);
      if (totalesCat) {
        proveedor_id = totalesCat.proveedor_id;
        monto_total = totalesCat.monto_total;
        moneda = totalesCat.moneda;
      }
    }

    const [result] = await conn.query(
      `INSERT INTO ordenes_compra
         (numero_oc, requerimiento_id, cotizacion_id, proveedor_id, monto_total, moneda,
          autorizado_por, estado, fecha_autorizacion, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'generada', NOW(), ?)`,
      [numero_oc, requerimiento_id, cotizacion_id || null, proveedor_id, monto_total, moneda, autorizado_por, notas]
    );
    const ocId = result.insertId;

    // Marcar el requerimiento como aprobado si no lo estaba
    await conn.query(
      `UPDATE requerimientos SET estado = 'aprobado'
       WHERE id = ? AND estado != 'aprobado'`,
      [requerimiento_id]
    );

    // Enlazar la OC generada de vuelta al requerimiento (para vista de solicitante + trazabilidad)
    await conn.query(
      `UPDATE requerimientos SET orden_compra_id = ?
       WHERE id = ?`,
      [ocId, requerimiento_id]
    );

    await conn.query(
      `INSERT INTO historial_estados
         (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
       VALUES ('orden_compra', ?, NULL, 'generada', ?, 'OC generada')`,
      [ocId, autorizado_por]
    );

    // Formalizar ítems de la cotización en catálogo (helper compartido)
    if (cotizacion_id) {
      await formalizarCotizacionEnCatalogo(cotizacion_id, conn);
    }

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
  en_proceso:  ['cerrada', 'cancelada'],
  recibida:    ['cerrada'],
  cerrada:     [],
  cancelada:   [],
};

async function cambiarEstado(id, nuevoEstado, usuarioId, notas = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[oc]] = await conn.query(
      'SELECT id, estado, datatextnow_id FROM ordenes_compra WHERE id = ? FOR UPDATE', [id]
    );
    if (!oc) throw { status: 404, mensaje: 'Orden de compra no encontrada' };

    const permitidos = TRANSICIONES_OC[oc.estado] || [];
    if (!permitidos.includes(nuevoEstado)) {
      throw { status: 422, mensaje: `No se puede pasar de '${oc.estado}' a '${nuevoEstado}'` };
    }

    if (nuevoEstado === 'cerrada') {
      const validacion = await validarCierreOrden(conn, id);
      if (!validacion.ok) {
        throw { status: 422, mensaje: validacion.mensaje };
      }

      if (!oc.datatextnow_id && validacion.po) {
        await conn.query(
          'UPDATE ordenes_compra SET datatextnow_id = ? WHERE id = ?',
          [validacion.po, id]
        );
      }
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

/**
 * Edita los campos de un ítem de catálogo desde la vista de OC (solo OC sin cotización).
 * Persiste proveedor_id, costo_referencia y unidad en catalogo, y congela proveedor en la OC.
 */
async function actualizarItemCatalogo(ocId, catalogoId, { proveedor_id, costo_referencia, unidad }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[oc]] = await conn.query(
      'SELECT id, requerimiento_id, cotizacion_id FROM ordenes_compra WHERE id = ?',
      [ocId]
    );
    if (!oc) throw { status: 404, mensaje: 'Orden de compra no encontrada' };
    if (oc.cotizacion_id) throw { status: 422, mensaje: 'Solo se puede editar ítems en OC sin cotización' };

    const [[ri]] = await conn.query(
      'SELECT id FROM requerimiento_items WHERE requerimiento_id = ? AND catalogo_id = ?',
      [oc.requerimiento_id, catalogoId]
    );
    if (!ri) throw { status: 404, mensaje: 'Ítem no encontrado en esta OC' };

    const sets  = [];
    const vals  = [];
    if (proveedor_id  !== undefined) { sets.push('proveedor_id = ?');    vals.push(proveedor_id || null); }
    if (costo_referencia !== undefined) { sets.push('costo_referencia = ?'); vals.push(costo_referencia != null ? parseFloat(costo_referencia) : null); }
    if (unidad !== undefined) { sets.push('unidad = ?'); vals.push(unidad ? String(unidad).trim() : null); }

    if (sets.length) {
      vals.push(catalogoId);
      await conn.query(`UPDATE catalogo SET ${sets.join(', ')} WHERE id = ?`, vals);
    }

    // Congelar proveedor en la OC usando el primer ítem con proveedor asignado
    const [[firstProv]] = await conn.query(
      `SELECT c.proveedor_id
       FROM requerimiento_items ri
       JOIN catalogo c ON c.id = ri.catalogo_id
       WHERE ri.requerimiento_id = ? AND c.proveedor_id IS NOT NULL
       LIMIT 1`,
      [oc.requerimiento_id]
    );
    await conn.query(
      'UPDATE ordenes_compra SET proveedor_id = ? WHERE id = ?',
      [firstProv?.proveedor_id || null, ocId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export { listar, obtenerPorId, crear, cambiarEstado, actualizarDatatextnow, actualizarItemCatalogo };