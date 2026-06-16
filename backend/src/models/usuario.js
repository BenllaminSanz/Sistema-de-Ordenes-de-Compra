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
    `INSERT INTO usuarios (nombre, email, password_hash, rol, email_verificado)
     VALUES (?, ?, ?, ?, 1)`,
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

async function listar(filtros = {}) {
  let sql = `
    SELECT id, nombre, email, rol, activo, email_verificado, created_at
    FROM usuarios
    WHERE 1=1
  `;
  const params = [];

  if (filtros.activo === true || filtros.activo === 'true' || filtros.activo === 1 || filtros.activo === '1') {
    sql += ' AND activo = 1';
  } else if (filtros.activo === false || filtros.activo === 'false' || filtros.activo === 0 || filtros.activo === '0') {
    sql += ' AND activo = 0';
  }

  sql += ' ORDER BY nombre ASC';

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function emailEnUsoPorOtro(email, id) {
  const [[row]] = await pool.query(
    'SELECT id FROM usuarios WHERE email = ? AND id != ? LIMIT 1',
    [email, id]
  );
  return !!row;
}

async function actualizar(id, datos) {
  const campos = {};
  if (datos.nombre !== undefined) campos.nombre = datos.nombre;
  if (datos.email !== undefined) campos.email = datos.email;
  if (datos.rol !== undefined) campos.rol = datos.rol;

  const keys = Object.keys(campos);
  if (!keys.length) return 0;

  const sets = keys.map(k => `${k} = ?`).join(', ');
  const [result] = await pool.query(
    `UPDATE usuarios SET ${sets} WHERE id = ?`,
    [...keys.map(k => campos[k]), id]
  );
  return result.affectedRows;
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
  emailEnUsoPorOtro,
  actualizar,
  cambiarEstado,
  guardarTokenVerificacion,
  buscarPorTokenVerificacion,
  marcarEmailVerificado,
  crearSolicitante
};