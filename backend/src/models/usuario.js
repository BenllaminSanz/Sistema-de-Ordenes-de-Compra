import pool from '../config/db.js';

async function buscarPorEmail(email) {
  const [[usuario]] = await pool.query(
    `SELECT id, nombre, email, password_hash, rol, activo
     FROM usuarios WHERE email = ?`,
    [email]
  );
  return usuario || null;
}

async function buscarPorId(id) {
  const [[usuario]] = await pool.query(
    `SELECT id, nombre, email, rol, activo, created_at
     FROM usuarios WHERE id = ?`,
    [id]
  );
  return usuario || null;
}

async function crear(datos) {
  const [result] = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     VALUES (?, ?, ?, ?)`,
    [datos.nombre, datos.email, datos.password_hash, datos.rol || 'solicitante']
  );
  return result.insertId;
}

async function actualizarPassword(id, password_hash) {
  await pool.query(
    'UPDATE usuarios SET password_hash = ? WHERE id = ?',
    [password_hash, id]
  );
}

async function listar() {
  const [rows] = await pool.query(
    `SELECT id, nombre, email, rol, activo, created_at
     FROM usuarios ORDER BY nombre ASC`
  );
  return rows;
}

async function cambiarEstado(id, activo) {
  const [result] = await pool.query(
    'UPDATE usuarios SET activo = ? WHERE id = ?',
    [activo ? 1 : 0, id]
  );
  return result.affectedRows;
}

export { 
  buscarPorEmail, 
  buscarPorId, 
  actualizarPassword, 
  crear,
  listar, 
  cambiarEstado
};