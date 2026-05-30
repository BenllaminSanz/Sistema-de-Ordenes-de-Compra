import pool from '../config/db.js';

async function buscarPorEmail(email) {
  const [[usuario]] = await pool.query(
    `SELECT id, nombre, email, password_hash, rol, activo, email_verificado
     FROM usuarios WHERE email = ?`,
    [email]
  );
  return usuario || null;
}

async function buscarPorId(id) {
  const [[usuario]] = await pool.query(
    `SELECT id, nombre, email, rol, activo, email_verificado, created_at
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

// ─── Funciones para verificación de correo ────────────────────────────────────

async function guardarTokenVerificacion(id, token, expiracion) {
  await pool.query(
    `UPDATE usuarios 
     SET token_verificacion = ?, token_expiracion = ? 
     WHERE id = ?`,
    [token, expiracion, id]
  );
}

async function buscarPorTokenVerificacion(token) {
  const [[usuario]] = await pool.query(
    `SELECT id, nombre, email, token_expiracion 
     FROM usuarios 
     WHERE token_verificacion = ?`,
    [token]
  );
  return usuario || null;
}

async function marcarEmailVerificado(id) {
  await pool.query(
    `UPDATE usuarios 
     SET email_verificado = 1, 
         token_verificacion = NULL, 
         token_expiracion = NULL 
     WHERE id = ?`,
    [id]
  );
}

async function crearSolicitante(datos) {
  const [result] = await pool.query(
    `INSERT INTO usuarios 
      (nombre, email, password_hash, rol, email_verificado, token_verificacion, token_expiracion)
     VALUES (?, ?, ?, 'solicitante', 0, ?, ?)`,
    [
      datos.nombre,
      datos.email,
      datos.password_hash,
      datos.token_verificacion,
      datos.token_expiracion
    ]
  );
  return result.insertId;
}

export { 
  buscarPorEmail, 
  buscarPorId, 
  actualizarPassword, 
  crear,
  listar, 
  cambiarEstado,
  guardarTokenVerificacion,
  buscarPorTokenVerificacion,
  marcarEmailVerificado,
  crearSolicitante
};