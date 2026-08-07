import pool from '../config/db.js';

/**
 * ¿El requerimiento debe pasar por cotización (RFQ)?
 * - Ítems libres (alta en catálogo): siempre
 * - SERVICIOS: siempre (costos variables, p. ej. reparaciones)
 * - PARTES / FLETES: solo si algún ítem de catálogo no tiene costo de referencia
 *
 * @param {{ tipo?: string, items?: Array<{catalogo_id:number}>, items_libres?: any[] }} datos
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} [conn]
 */
export async function calcularRequiereCotizacion(datos = {}, conn = null) {
  const db = conn || pool;
  const itemsLibres = Array.isArray(datos.items_libres) ? datos.items_libres : [];
  if (itemsLibres.length > 0) return true;

  const items = Array.isArray(datos.items) ? datos.items : [];
  const ids = [...new Set(items.map((i) => i?.catalogo_id).filter(Boolean))];
  if (!ids.length) return false;

  const [rows] = await db.query(
    `SELECT id, costo_referencia FROM catalogo WHERE id IN (?)`,
    [ids]
  );
  // Sin precio de referencia → hay que cotizar
  return rows.some(
    (r) => r.costo_referencia == null
      || String(r.costo_referencia).trim() === ''
      || !Number.isFinite(Number(r.costo_referencia))
      || Number(r.costo_referencia) === 0
  );
}

/**
 * Valida que todos los ítems del catálogo pertenezcan al mismo proveedor.
 */
export async function validarMismoProveedorCatalogo(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: true };
  }

  const ids = [...new Set(items.map(i => i.catalogo_id).filter(Boolean))];
  if (!ids.length) {
    return { ok: true };
  }

  const [rows] = await pool.query(
    `SELECT c.id, c.proveedor_id, c.codigo, p.nombre AS proveedor_nombre
     FROM catalogo c
     LEFT JOIN proveedores p ON p.id = c.proveedor_id
     WHERE c.id IN (?)`,
    [ids]
  );

  if (rows.length !== ids.length) {
    return { ok: false, mensaje: 'Uno o más ítems del catálogo no existen o están inactivos' };
  }

  const proveedores = new Set(rows.map(r => r.proveedor_id ?? null));

  if (proveedores.size > 1) {
    return {
      ok: false,
      mensaje: 'Todos los ítems del catálogo deben ser del mismo proveedor. No se pueden mezclar proveedores en un mismo requerimiento.',
    };
  }

  return { ok: true, proveedor_id: rows[0]?.proveedor_id ?? null };
}

export async function calcularTotalesCatalogoRequerimiento(requerimiento_id, conn = null) {
  const db = conn || pool;
  const [items] = await db.query(
    `SELECT ri.cantidad, c.costo_referencia, c.moneda, c.proveedor_id
     FROM requerimiento_items ri
     JOIN catalogo c ON c.id = ri.catalogo_id
     WHERE ri.requerimiento_id = ?`,
    [requerimiento_id]
  );

  if (!items.length) return null;

  let total = 0;
  for (const it of items) {
    const cant = parseFloat(it.cantidad) || 0;
    const costo = parseFloat(it.costo_referencia) || 0;
    total += cant * costo;
  }

  return {
    proveedor_id: items[0].proveedor_id || null,
    monto_total: Math.round(total * 100) / 100,
    moneda: items[0].moneda || 'MXN',
  };
}
