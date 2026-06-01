import pool from '../config/db.js';

/**
 * Listar elementos del catálogo con filtros
 */
async function listar(filtros = {}) {
  const { tipo, busqueda, soloActivos = false } = filtros;

  let sql = `
    SELECT 
      c.id, 
      c.tipo, 
      c.codigo, 
      c.descripcion, 
      c.costo_referencia, 
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

  sql += ' ORDER BY c.codigo ASC';

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function obtenerPorId(id) {
  const [[item]] = await pool.query(
    `
    SELECT 
      c.*, 
      p.nombre as proveedor_nombre
    FROM catalogo c
    LEFT JOIN proveedores p ON p.id = c.proveedor_id
    WHERE c.id = ?
    `,
    [id]
  );
  return item || null;
}

async function crear(datos) {
  const [result] = await pool.query(
    `
    INSERT INTO catalogo (tipo, codigo, descripcion, costo_referencia, proveedor_id, activo)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      datos.tipo,
      datos.codigo,
      datos.descripcion,
      datos.costo_referencia || 0,
      datos.proveedor_id || null,
      datos.activo !== undefined ? datos.activo : 1
    ]
  );
  return result.insertId;
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

export { listar, obtenerPorId, crear, actualizar, cambiarEstado };