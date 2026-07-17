import pool from '../config/db.js';

async function listar({ soloActivas = true } = {}) {
  let sql = `
    SELECT id, codigo, nombre, activo, created_at, updated_at
    FROM unidades_medida
    WHERE 1=1
  `;
  if (soloActivas) sql += ' AND activo = 1';
  sql += ' ORDER BY nombre ASC, codigo ASC';
  const [rows] = await pool.query(sql);
  return rows;
}

async function obtenerPorId(id) {
  const [[row]] = await pool.query(
    'SELECT id, codigo, nombre, activo, created_at, updated_at FROM unidades_medida WHERE id = ?',
    [id]
  );
  return row || null;
}

async function crear({ codigo, nombre, activo = 1 }) {
  const cod = String(codigo || '').trim();
  const nom = String(nombre || '').trim();
  if (!cod || !nom) {
    throw { status: 400, mensaje: 'Código y nombre de unidad son obligatorios' };
  }
  const [r] = await pool.query(
    `INSERT INTO unidades_medida (codigo, nombre, activo) VALUES (?, ?, ?)`,
    [cod, nom, activo ? 1 : 0]
  );
  return r.insertId;
}

async function actualizar(id, datos) {
  const campos = {};
  if (datos.codigo !== undefined) campos.codigo = String(datos.codigo).trim();
  if (datos.nombre !== undefined) campos.nombre = String(datos.nombre).trim();
  if (datos.activo !== undefined) campos.activo = datos.activo ? 1 : 0;
  if (!Object.keys(campos).length) return 0;
  const sets = Object.keys(campos).map((c) => `${c} = ?`).join(', ');
  const [r] = await pool.query(
    `UPDATE unidades_medida SET ${sets} WHERE id = ?`,
    [...Object.values(campos), id]
  );
  return r.affectedRows;
}

async function eliminar(id) {
  // Soft: desactivar (las unidades se usan en texto de catálogo/REQ)
  const [r] = await pool.query(
    'UPDATE unidades_medida SET activo = 0 WHERE id = ?',
    [id]
  );
  return r.affectedRows;
}

export { listar, obtenerPorId, crear, actualizar, eliminar };
