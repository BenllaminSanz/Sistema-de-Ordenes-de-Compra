import pool from '../config/db.js';

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