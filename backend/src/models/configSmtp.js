import pool from '../config/db.js';
import { encrypt, decrypt } from '../config/cryptoHelper.js';

/**
 * Modelo para configuración SMTP (una sola fila activa).
 * La contraseña se almacena encriptada.
 * Si no existe registro o está inactivo, el sistema cae al .env (ver mailer.js).
 */

const DEFAULT_FROM = 'Sistema de Órdenes de Compra';

export async function obtenerConfig() {
  const [[row]] = await pool.query(
    `SELECT id, host, port, secure, user, pass_encrypted, from_name,
            tls_ciphers, reject_unauthorized, activo, updated_at, updated_by
     FROM configuracion_smtp
     WHERE activo = 1
     ORDER BY id DESC
     LIMIT 1`
  );

  if (!row) return null;

  // Nunca exponer pass_encrypted al frontend. Devolvemos pass_masked para UI.
  return {
    id: row.id,
    host: row.host,
    port: row.port,
    secure: !!row.secure,
    user: row.user,
    from_name: row.from_name || DEFAULT_FROM,
    tls_ciphers: row.tls_ciphers || 'SSLv3',
    reject_unauthorized: !!row.reject_unauthorized,
    activo: !!row.activo,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
    // Para la UI: indicar que hay credencial guardada
    tiene_password: !!(row.pass_encrypted && row.pass_encrypted.length > 0),
    pass_masked: row.pass_encrypted ? '••••••••••••' : ''
  };
}

/**
 * Obtiene la config completa (incluyendo pass desencriptado) para uso interno del mailer.
 * Devuelve null si no hay config activa.
 */
export async function obtenerConfigParaMailer() {
  const [[row]] = await pool.query(
    `SELECT id, host, port, secure, user, pass_encrypted, from_name,
            tls_ciphers, reject_unauthorized, activo
     FROM configuracion_smtp
     WHERE activo = 1
     ORDER BY id DESC
     LIMIT 1`
  );

  if (!row || !row.host || !row.user) return null;

  let passPlano = '';
  try {
    if (row.pass_encrypted) {
      passPlano = decrypt(row.pass_encrypted);
    }
  } catch (e) {
    console.error('[configSmtp] Error desencriptando pass SMTP:', e.message);
    return null;
  }

  return {
    host: row.host,
    port: Number(row.port) || 587,
    secure: !!row.secure,
    user: row.user,
    pass: passPlano,
    from_name: row.from_name || DEFAULT_FROM,
    tls_ciphers: row.tls_ciphers || 'SSLv3',
    reject_unauthorized: !!row.reject_unauthorized
  };
}

export async function guardarConfig(datos, updatedById = null) {
  const {
    host,
    port,
    secure,
    user,
    pass,                 // texto plano (solo si se quiere actualizar)
    from_name,
    tls_ciphers,
    reject_unauthorized
  } = datos;

  if (!host || !user) {
    throw new Error('host y user son obligatorios');
  }

  // Buscar si ya existe una config activa
  const [[existente]] = await pool.query(
    'SELECT id, pass_encrypted FROM configuracion_smtp WHERE activo=1 ORDER BY id DESC LIMIT 1'
  );

  let passEncrypted = existente?.pass_encrypted || '';

  // Solo re-encriptar si viene un pass nuevo no vacío
  if (pass && pass.trim().length > 0) {
    passEncrypted = encrypt(pass.trim());
  }

  const params = [
    host.trim(),
    Number(port) || 587,
    secure ? 1 : 0,
    user.trim().toLowerCase(),
    passEncrypted,
    (from_name || DEFAULT_FROM).trim(),
    tls_ciphers || 'SSLv3',
    reject_unauthorized ? 1 : 0,
    updatedById
  ];

  if (existente) {
    await pool.query(
      `UPDATE configuracion_smtp
       SET host=?, port=?, secure=?, user=?, pass_encrypted=?, from_name=?,
           tls_ciphers=?, reject_unauthorized=?, updated_by=?
       WHERE id = ?`,
      [...params, existente.id]
    );
    return existente.id;
  } else {
    const [result] = await pool.query(
      `INSERT INTO configuracion_smtp
       (host, port, secure, user, pass_encrypted, from_name, tls_ciphers, reject_unauthorized, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params
    );
    return result.insertId;
  }
}

/**
 * Marca la configuración como inactiva (vuelve a usar .env).
 */
export async function desactivarConfig() {
  await pool.query('UPDATE configuracion_smtp SET activo=0 WHERE activo=1');
  return true;
}
