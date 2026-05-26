import pool from '../config/db.js';

async function listar(soloActivos = false) {
  const where = soloActivos ? 'WHERE activo = 1' : '';
  const [rows] = await pool.query(
    `SELECT id, nombre, email, telefono, rfc, direccion, activo, created_at
     FROM proveedores ${where} ORDER BY nombre ASC`
  );
  return rows;
}

async function obtenerPorId(id) {
  const [[prov]] = await pool.query(
    'SELECT * FROM proveedores WHERE id = ?', [id]
  );
  return prov || null;
}

async function crear(datos) {
  const [result] = await pool.query(
    `INSERT INTO proveedores (nombre, email, telefono, rfc, direccion)
     VALUES (?, ?, ?, ?, ?)`,
    [datos.nombre, datos.email, datos.telefono || null,
     datos.rfc || null, datos.direccion || null]
  );
  return result.insertId;
}

async function actualizar(id, datos) {
  const campos = {};
  ['nombre','email','telefono','rfc','direccion'].forEach(c => {
    if (datos[c] !== undefined) campos[c] = datos[c];
  });
  if (!Object.keys(campos).length) return 0;
  const sets = Object.keys(campos).map(c => `${c} = ?`).join(', ');
  const [r] = await pool.query(
    `UPDATE proveedores SET ${sets} WHERE id = ?`,
    [...Object.values(campos), id]
  );
  return r.affectedRows;
}

async function cambiarEstado(id, activo) {
  const [r] = await pool.query(
    'UPDATE proveedores SET activo = ? WHERE id = ?', [activo ? 1 : 0, id]
  );
  return r.affectedRows;
}

export { listar, obtenerPorId, crear, actualizar, cambiarEstado };