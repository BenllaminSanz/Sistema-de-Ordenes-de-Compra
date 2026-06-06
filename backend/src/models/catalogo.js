import pool from '../config/db.js';

/**
 * Listar elementos del catálogo con filtros
 */
async function listar(filtros = {}) {
  const { tipo, busqueda, proveedor_id, soloActivos = false } = filtros;

  let sql = `
    SELECT 
      c.id, 
      c.tipo, 
      c.codigo, 
      c.descripcion, 
      c.costo_referencia, 
      'MXN' AS moneda,
      c.proveedor_id,
      p.nombre as proveedor_nombre,
      c.activo, 
      c.created_at, 
      c.updated_at
    FROM catalogo c
    LEFT JOIN proveedores p ON p.id = c.proveedor_id
    WHERE 1=1
  `;
  const params = [];

  if (soloActivos) {
    sql += ' AND c.activo = 1';
  }

  if (tipo) {
    sql += ' AND c.tipo = ?';
    params.push(tipo);
  }

  if (busqueda) {
    sql += ` AND (c.codigo LIKE ? OR c.descripcion LIKE ?)`;
    const like = `%${busqueda}%`;
    params.push(like, like);
  }

  if (proveedor_id) {
    sql += ' AND c.proveedor_id = ?';
    params.push(proveedor_id);
  }

  sql += ' ORDER BY c.codigo ASC';

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function obtenerPorId(id) {
  const [[item]] = await pool.query(
    `
    SELECT 
      c.*, 
      'MXN' AS moneda,
      p.nombre as proveedor_nombre
    FROM catalogo c
    LEFT JOIN proveedores p ON p.id = c.proveedor_id
    WHERE c.id = ?
    `,
    [id]
  );
  return item || null;
}

async function crear(datos, conn = null) {
  const db = conn || pool;
  const [result] = await db.query(
    `
    INSERT INTO catalogo (tipo, codigo, descripcion, costo_referencia, proveedor_id, activo)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      datos.tipo,
      datos.codigo,
      datos.descripcion,
      datos.costo_referencia != null ? datos.costo_referencia : null,
      datos.proveedor_id || null,
      datos.activo !== undefined ? datos.activo : 1
    ]
  );
  return result.insertId;
}

/**
 * Genera un código único para el catálogo basado en tipo y descripción.
 * Usado al formalizar ítems libres desde una cotización seleccionada.
 */
async function generarCodigoUnico(conn, tipo, baseDescripcion = '') {
  const prefijos = { 
    PARTES: 'P', 
    SERVICIOS: 'S', 
    FLETES: 'F', 
    PRODUCTOS: 'P' 
  };
  const pref = prefijos[tipo] || 'X';

  let base = (baseDescripcion || 'NUEVO')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8) || 'ITEM';

  let codigo = `${pref}-${base}`;
  let i = 1;

  while (true) {
    const [ex] = await conn.query('SELECT 1 FROM catalogo WHERE codigo = ? LIMIT 1', [codigo]);
    if (ex.length === 0) return codigo;

    codigo = `${pref}-${base}-${i}`;
    i++;
    if (i > 50) {
      codigo = `${pref}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      // one last check
      const [ex2] = await conn.query('SELECT 1 FROM catalogo WHERE codigo = ? LIMIT 1', [codigo]);
      if (ex2.length === 0) return codigo;
      // very rare fallback
      codigo = `${pref}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      return codigo;
    }
  }
}

async function actualizar(id, datos) {
  const campos = {};
  ['tipo', 'codigo', 'descripcion', 'costo_referencia', 'proveedor_id'].forEach(c => {
    if (datos[c] !== undefined) campos[c] = datos[c];
  });

  if (!Object.keys(campos).length) return 0;

  const sets = Object.keys(campos).map(c => `${c} = ?`).join(', ');
  const [r] = await pool.query(
    `UPDATE catalogo SET ${sets} WHERE id = ?`,
    [...Object.values(campos), id]
  );
  return r.affectedRows;
}

async function cambiarEstado(id, activo) {
  const [r] = await pool.query(
    'UPDATE catalogo SET activo = ? WHERE id = ?',
    [activo ? 1 : 0, id]
  );
  return r.affectedRows;
}

export { listar, obtenerPorId, crear, actualizar, cambiarEstado, generarCodigoUnico };