import pool from '../config/db.js';
import * as Catalogo from './catalogo.js';
import {
  formalizarCotizacionEnCatalogo,
  aplicarCodigosCatalogoItems,
  assertCodigosCatalogoListos,
} from './cotizaciones.js';
import { validarCierreOrden } from '../utils/ocCierre.js';
import { calcularTotalesCatalogoRequerimiento } from '../utils/catalogoItems.js';
import { siguienteConsecutivoNumerico } from '../utils/consecutivos.js';
import { puedeTransicionOc } from '../domain/ocEstados.js';
import {
  construirIndiceAreasDeptos,
  aplicarVistaAreaDepto,
} from '../config/departamentosStore.js';

/** Usa el mismo consecutivo numérico del requerimiento de origen. */
async function generarNumeroOC(conn, requerimiento_id) {
  const [[req]] = await conn.query(
    'SELECT consecutivo FROM requerimientos WHERE id = ?',
    [requerimiento_id]
  );

  if (req?.consecutivo) {
    return req.consecutivo;
  }

  const [rows] = await conn.query('SELECT numero_oc FROM ordenes_compra');
  return siguienteConsecutivoNumerico(rows.map((r) => r.numero_oc));
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
    orden,
    ordenar_por,
    pagina = 1,
    limite = 20,
  } = filtros;
  // orden: 'asc' | 'desc'; ordenar_por: fecha | fecha_po | numero_oc | estado | tipo | solicitante | updated_at
  const ordenExplicit = (orden != null && String(orden).trim() !== '')
    || (ordenar_por != null && String(ordenar_por).trim() !== '');
  const dir = String(orden || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const COLS_ORDEN = {
    fecha: 'COALESCE(oc.fecha_po, oc.fecha_autorizacion, oc.created_at)',
    fecha_po: 'oc.fecha_po',
    created_at: 'oc.created_at',
    numero_oc: 'oc.numero_oc',
    estado: 'oc.estado',
    tipo: 'r.tipo',
    solicitante: 'sol.nombre',
    autorizado: 'u.nombre',
    updated_at: 'oc.updated_at',
    proveedor: 'p.nombre',
  };
  const colOrden = COLS_ORDEN[String(ordenar_por || 'fecha').toLowerCase()] || COLS_ORDEN.fecha;

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

  // Sin PO real de DTN: vacío/NULL o marcado explícitamente como NA
  if (sin_po === 'true' || sin_po === true || sin_po === '1') {
    where.push(`(
      oc.datatextnow_id IS NULL
      OR TRIM(oc.datatextnow_id) = ''
      OR UPPER(TRIM(oc.datatextnow_id)) = 'NA'
    )`);
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
       oc.id, oc.requerimiento_id, oc.numero_oc, oc.estado,
       oc.fecha_autorizacion, oc.datatextnow_id, oc.fecha_po,
       oc.created_at, oc.updated_at, oc.notas,
       r.consecutivo, r.tipo, r.notas AS descripcion, r.solicitante_id,
       r.titulo_solicitud, r.area, r.departamento, r.estado AS req_estado,
       r.created_at AS req_created_at,
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
     ORDER BY ${
       // Activas sin orden por columna: prioriza sin PO/NA y luego más antiguas (cola de trabajo)
       soloActivas && !ordenExplicit
         ? `(oc.datatextnow_id IS NULL OR TRIM(oc.datatextnow_id) = '' OR UPPER(TRIM(oc.datatextnow_id)) = 'NA') DESC, oc.created_at ASC`
         : `${colOrden} ${dir}, oc.id ${dir}`
     }
     LIMIT ? OFFSET ?`,
    [...params, Number(limite), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(DISTINCT oc.id) AS total
     FROM ordenes_compra oc
     ${joinsFiltro}
     ${whereClause}`, params
  );

  const indiceVista = await construirIndiceAreasDeptos();
  for (const row of rows) {
    aplicarVistaAreaDepto(row, indiceVista);
  }

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
      SELECT ci.id, ci.descripcion, ci.cantidad, ci.unidad, ci.precio_unitario, ci.notas_item,
             ci.codigo_catalogo, ci.catalogo_id,
             COALESCE(NULLIF(TRIM(ci.codigo_catalogo), ''), c.codigo) AS codigo,
             c.proveedor_id, p.num_proveedor AS proveedor_num, p.nombre AS proveedor_nombre
      FROM cotizacion_items ci
      LEFT JOIN catalogo c ON c.id = ci.catalogo_id
      LEFT JOIN proveedores p ON p.id = c.proveedor_id
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

/**
 * Normaliza PO al crear/editar OC.
 * - 'NA' (sin PO en DTN): datatextnow_id = 'NA' + fecha_po obligatoria
 *   (fecha de cierre/registro operativo, aunque no haya PO en DTN)
 * - Con PO: número obligatorio + fecha_po obligatoria
 */
function normalizarPoYFecha({ datatextnow_id, fecha_po, requerido = true } = {}) {
  const raw = datatextnow_id == null ? '' : String(datatextnow_id).trim();
  if (!raw) {
    if (requerido) {
      throw { status: 400, mensaje: 'Debes indicar el PO de DataTextNow o marcar NA si no tiene PO' };
    }
    return { datatextnow_id: null, fecha_po: null };
  }

  let fecha = fecha_po == null || fecha_po === '' ? null : String(fecha_po).trim();
  if (!fecha) {
    throw {
      status: 400,
      mensaje: raw.toUpperCase() === 'NA'
        ? 'La fecha es obligatoria aunque el PO sea NA (fecha de registro/cierre de la orden)'
        : 'La fecha del PO (DataTextNow) es obligatoria cuando se registra un número de PO',
    };
  }
  // Aceptar YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw { status: 400, mensaje: 'fecha_po debe tener formato YYYY-MM-DD' };
  }

  if (raw.toUpperCase() === 'NA') {
    return { datatextnow_id: 'NA', fecha_po: fecha };
  }
  return { datatextnow_id: raw, fecha_po: fecha };
}

/**
 * Crea una OC. itemsCodigoCatalogo: [{ id, codigo_catalogo }] opcional (modal de Nº ítem).
 * poDatos: { datatextnow_id, fecha_po } — PO obligatorio al crear (o 'NA').
 * Formaliza catálogo al final de la misma transacción.
 * Al generar la OC el requerimiento pasa a estado 'cerrado'.
 */
async function crear(requerimiento_id, cotizacion_id, autorizado_por, notas = null, itemsCodigoCatalogo = null, poDatos = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const po = normalizarPoYFecha({
      datatextnow_id: poDatos?.datatextnow_id,
      fecha_po: poDatos?.fecha_po,
      requerido: true,
    });

    if (cotizacion_id && Array.isArray(itemsCodigoCatalogo) && itemsCodigoCatalogo.length > 0) {
      await aplicarCodigosCatalogoItems(cotizacion_id, itemsCodigoCatalogo, conn);
    }

    if (cotizacion_id) {
      await assertCodigosCatalogoListos(cotizacion_id, conn);
    }

    const numero_oc = await generarNumeroOC(conn, requerimiento_id);

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
          autorizado_por, estado, fecha_autorizacion, datatextnow_id, fecha_po, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'generada', NOW(), ?, ?, ?)`,
      [
        numero_oc,
        requerimiento_id,
        cotizacion_id || null,
        proveedor_id,
        monto_total,
        moneda,
        autorizado_por,
        po.datatextnow_id,
        po.fecha_po,
        notas,
      ]
    );
    const ocId = result.insertId;

    // Cerrar el REQ al generar la OC (bug: antes se dejaba en 'aprobado')
    const [[reqPrev]] = await conn.query(
      'SELECT id, estado FROM requerimientos WHERE id = ? FOR UPDATE',
      [requerimiento_id]
    );
    if (!reqPrev) {
      throw { status: 404, mensaje: 'Requerimiento no encontrado' };
    }

    await conn.query(
      `UPDATE requerimientos
       SET estado = 'cerrado', orden_compra_id = ?
       WHERE id = ?`,
      [ocId, requerimiento_id]
    );

    if (reqPrev.estado !== 'cerrado') {
      await conn.query(
        `INSERT INTO historial_estados
           (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
         VALUES ('requerimiento', ?, ?, 'cerrado', ?, ?)`,
        [
          requerimiento_id,
          reqPrev.estado,
          autorizado_por,
          `REQ cerrado al generar OC ${numero_oc}`,
        ]
      );
    }

    const notaHistOc = po.datatextnow_id === 'NA'
      ? `OC generada (PO = NA, fecha registro ${po.fecha_po || '—'})`
      : `OC generada (PO DTN ${po.datatextnow_id}${po.fecha_po ? `, fecha PO ${po.fecha_po}` : ''})`;

    await conn.query(
      `INSERT INTO historial_estados
         (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
       VALUES ('orden_compra', ?, NULL, 'generada', ?, ?)`,
      [ocId, autorizado_por, notaHistOc]
    );

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

/**
 * Máquina de estados de OC: ver domain/ocEstados.js
 */
async function cambiarEstado(id, nuevoEstado, usuarioId, notas = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[oc]] = await conn.query(
      'SELECT id, estado, datatextnow_id FROM ordenes_compra WHERE id = ? FOR UPDATE', [id]
    );
    if (!oc) throw { status: 404, mensaje: 'Orden de compra no encontrada' };

    if (!puedeTransicionOc(oc.estado, nuevoEstado)) {
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
 * Actualiza el número de PO / Order code de DataTextNow y su fecha manual.
 * Acepta 'NA' (sin PO) o número; en ambos casos fecha_po es obligatoria
 * (o se reutiliza la ya registrada si no se envía una nueva).
 */
async function actualizarDatatextnow(id, datatextnow_id, fecha_po = undefined) {
  const raw = datatextnow_id == null ? '' : String(datatextnow_id).trim();
  if (!raw) {
    throw { status: 400, mensaje: 'Debes indicar el PO de DataTextNow o marcar NA si no tiene PO' };
  }

  const poId = raw.toUpperCase() === 'NA' ? 'NA' : raw;
  let fecha = null;

  if (fecha_po != null && fecha_po !== '') {
    fecha = String(fecha_po).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw { status: 400, mensaje: 'fecha_po debe tener formato YYYY-MM-DD' };
    }
  } else {
    const [[oc]] = await pool.query(
      'SELECT fecha_po FROM ordenes_compra WHERE id = ?',
      [id]
    );
    if (oc?.fecha_po) {
      fecha = oc.fecha_po instanceof Date
        ? oc.fecha_po.toISOString().slice(0, 10)
        : String(oc.fecha_po).slice(0, 10);
    } else {
      throw {
        status: 400,
        mensaje: poId === 'NA'
          ? 'La fecha es obligatoria aunque el PO sea NA (fecha de registro/cierre de la orden)'
          : 'La fecha del PO es obligatoria cuando se registra un número de PO',
      };
    }
  }

  const [r] = await pool.query(
    'UPDATE ordenes_compra SET datatextnow_id = ?, fecha_po = ? WHERE id = ?',
    [poId, fecha, id]
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

/**
 * Corrige el proveedor de la OC (y de la cotización ligada, si hay).
 * No reenvía RFQ ni cambia montos/ítems.
 */
async function actualizarProveedor(ocId, proveedor_id, usuarioId = null) {
  const pid = parseInt(proveedor_id, 10);
  if (!pid || Number.isNaN(pid)) {
    throw { status: 400, mensaje: 'proveedor_id es requerido' };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[oc]] = await conn.query(
      `SELECT oc.id, oc.estado, oc.proveedor_id, oc.cotizacion_id,
              p.nombre AS proveedor_nombre, p.num_proveedor AS proveedor_num
       FROM ordenes_compra oc
       LEFT JOIN proveedores p ON p.id = oc.proveedor_id
       WHERE oc.id = ?`,
      [ocId]
    );
    if (!oc) throw { status: 404, mensaje: 'Orden de compra no encontrada' };
    if (oc.estado === 'cancelada') {
      throw { status: 422, mensaje: 'No se puede cambiar el proveedor de una OC cancelada' };
    }

    const [[prov]] = await conn.query(
      'SELECT id, nombre, num_proveedor, activo FROM proveedores WHERE id = ?',
      [pid]
    );
    if (!prov) throw { status: 404, mensaje: 'Proveedor no encontrado' };
    if (Number(prov.activo) === 0) {
      throw { status: 422, mensaje: 'El proveedor está inactivo' };
    }

    if (Number(oc.proveedor_id) === pid) {
      await conn.commit();
      return 1;
    }

    await conn.query('UPDATE ordenes_compra SET proveedor_id = ? WHERE id = ?', [pid, ocId]);

    if (oc.cotizacion_id) {
      await conn.query(
        'UPDATE cotizaciones SET proveedor_id = ? WHERE id = ?',
        [pid, oc.cotizacion_id]
      );
    }

    const anterior = oc.proveedor_nombre
      ? `${oc.proveedor_num ? oc.proveedor_num + ' — ' : ''}${oc.proveedor_nombre}`
      : (oc.proveedor_id ? `#${oc.proveedor_id}` : 'sin proveedor');
    const nuevo = `${prov.num_proveedor ? prov.num_proveedor + ' — ' : ''}${prov.nombre}`;

    await conn.query(
      `INSERT INTO historial_estados
         (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
       VALUES ('orden_compra', ?, ?, ?, ?, ?)`,
      [
        ocId,
        oc.estado,
        oc.estado,
        usuarioId || null,
        `Proveedor corregido: ${anterior} → ${nuevo} (sin recotizar)`,
      ]
    );

    await conn.commit();
    return 1;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Actualiza notas de compras de la OC (editables durante todo el ciclo).
 */
async function actualizarNotas(id, notas) {
  const texto = notas == null ? null : String(notas);
  const [r] = await pool.query(
    'UPDATE ordenes_compra SET notas = ? WHERE id = ?',
    [texto, id]
  );
  return r.affectedRows;
}

export {
  listar,
  obtenerPorId,
  crear,
  cambiarEstado,
  actualizarDatatextnow,
  actualizarItemCatalogo,
  actualizarProveedor,
  actualizarNotas,
};