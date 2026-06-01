import pool from '../config/db.js';

/**
 * Genera el consecutivo siguiente con formato REQ-YYYY-NNNN.
 * Ejemplo: REQ-2024-0001
 */
async function generarConsecutivo(conn) {
  const anio = new Date().getFullYear();
  const prefijo = `REQ-${anio}-`;

  const [rows] = await conn.query(
    `SELECT consecutivo FROM requerimientos
     WHERE consecutivo LIKE ?
     ORDER BY id DESC LIMIT 1`,
    [`${prefijo}%`]
  );

  if (rows.length === 0) return `${prefijo}0001`;

  const ultimo = parseInt(rows[0].consecutivo.split('-')[2], 10);
  return `${prefijo}${String(ultimo + 1).padStart(4, '0')}`;
}

// ─── Consultas ────────────────────────────────────────────────────────────────

/**
 * Listar requerimientos con filtros opcionales y paginación.
 * filtros: { estado, tipo, solicitante_id, busqueda, pagina, limite }
 */
async function listar(filtros = {}) {
  const { estado, area, departamento, tipo, solicitante_id, busqueda, pagina = 1, limite = 20 } = filtros;

  let where = [];
  let params = [];

  if (estado)         { where.push('r.estado = ?');                     params.push(estado); }
  if (area)           { where.push('r.area = ?');                       params.push(area); }
  if (departamento)   { where.push('r.departamento = ?');               params.push(departamento); }
  if (tipo)           { where.push('r.tipo = ?');                       params.push(tipo); }
  if (solicitante_id) { where.push('r.solicitante_id = ?');             params.push(solicitante_id); }
  if (busqueda)       { where.push('(r.consecutivo LIKE ? OR r.descripcion LIKE ?)');
                        params.push(`%${busqueda}%`, `%${busqueda}%`); }

  const clausulaWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (pagina - 1) * limite;

  const [rows] = await pool.query(
    `SELECT
       r.id, r.consecutivo, r.titulo_solicitud, r.area, r.departamento, r.tipo, r.estado,
       r.requiere_cotizacion, r.descripcion,
       r.datatextnow_id, r.notas_rechazo,
       r.created_at, r.updated_at,
       u.nombre AS solicitante_nombre,
       u.email  AS solicitante_email
     FROM requerimientos r
     JOIN usuarios u ON u.id = r.solicitante_id
     ${clausulaWhere}
     ORDER BY r.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limite), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM requerimientos r ${clausulaWhere}`,
    params
  );

  return { datos: rows, total, pagina: Number(pagina), limite: Number(limite) };
}

/**
 * Obtener un requerimiento por ID, incluyendo su historial de estados.
 */
async function obtenerPorId(id) {
  const [[req]] = await pool.query(
    `SELECT
       r.*,
       u.nombre AS solicitante_nombre,
       u.email  AS solicitante_email
     FROM requerimientos r
     JOIN usuarios u ON u.id = r.solicitante_id
     WHERE r.id = ?`,
    [id]
  );

  if (!req) return null;

  const [historial] = await pool.query(
    `SELECT
       h.estado_anterior, h.estado_nuevo,
       h.notas, h.created_at,
       u.nombre AS cambiado_por
     FROM historial_estados h
     JOIN usuarios u ON u.id = h.cambiado_por
     WHERE h.entidad_tipo = 'requerimiento' AND h.entidad_id = ?
     ORDER BY h.created_at ASC`,
    [id]
  );

  return { ...req, historial };
}

/**
 * Crear un nuevo requerimiento dentro de una transacción.
 * Genera el consecutivo y registra el primer estado en historial.
 */
async function crear(datos, solicitante_id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const consecutivo = await generarConsecutivo(conn);
  
    const [result] = await conn.query(
      `INSERT INTO requerimientos
         (consecutivo, solicitante_id, titulo_solicitud,  area, departamento, tipo, descripcion, requiere_cotizacion, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'borrador')`,
      [
        consecutivo,
        solicitante_id,
        datos.titulo_solicitud,
        datos.area,
        datos.departamento,
        datos.tipo,
        datos.descripcion,
        datos.requiere_cotizacion ? 1 : 0,
      ]
    );

    const requerimientoId = result.insertId;

    // Registrar estado inicial en historial
    await conn.query(
      `INSERT INTO historial_estados
         (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
       VALUES ('requerimiento', ?, NULL, 'borrador', ?, 'Requerimiento creado como borrador')`,
      [requerimientoId, solicitante_id]
    );

    await conn.commit();
    return requerimientoId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Actualizar campos editables de un requerimiento.
 * Solo permitido cuando estado = 'borrador' o 'incompleto'.
 */
async function actualizar(id, datos) {
  const campos = {};
  if (datos.titulo_solicitud        !== undefined) campos.titulo_solicitud        = datos.titulo_solicitud;
  if (datos.area                    !== undefined) campos.area                    = datos.area;
  if (datos.departamento            !== undefined) campos.departamento            = datos.departamento;
  if (datos.tipo        !== undefined) campos.tipo        = datos.tipo;
  if (datos.descripcion !== undefined) campos.descripcion = datos.descripcion;
  if (datos.requiere_cotizacion !== undefined)
    campos.requiere_cotizacion = datos.requiere_cotizacion ? 1 : 0;
  if (datos.datatextnow_id !== undefined) campos.datatextnow_id = datos.datatextnow_id; // PO de DataTextNow (de reportes Excel)

  if (Object.keys(campos).length === 0) return 0;

  const sets    = Object.keys(campos).map(c => `${c} = ?`).join(', ');
  const valores = [...Object.values(campos), id];

  const [result] = await pool.query(
    `UPDATE requerimientos SET ${sets} WHERE id = ? AND estado IN ('borrador','incompleto')`,
    valores
  );

  return result.affectedRows;
}

/**
 * Cambiar el estado de un requerimiento y registrar en historial.
 * estadosPermitidos define las transiciones válidas por estado origen.
 */
const TRANSICIONES = {
  borrador:    ['en_revision'],
  en_revision: ['aprobado', 'incompleto', 'rechazado'],
  incompleto:  ['en_revision'],
  aprobado:    ['cerrado'],
  rechazado:   [],
  cerrado:     [],
};

async function cambiarEstado(id, nuevoEstado, usuarioId, notas = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[req]] = await conn.query(
      'SELECT estado FROM requerimientos WHERE id = ? FOR UPDATE',
      [id]
    );

    if (!req) throw { status: 404, mensaje: 'Requerimiento no encontrado' };

    const permitidos = TRANSICIONES[req.estado] || [];
    if (!permitidos.includes(nuevoEstado)) {
      throw {
        status: 422,
        mensaje: `No se puede pasar de '${req.estado}' a '${nuevoEstado}'`,
      };
    }

    await conn.query(
      `UPDATE requerimientos
       SET estado = ?, notas_rechazo = ?
       WHERE id = ?`,
      [nuevoEstado, notas, id]
    );

    await conn.query(
      `INSERT INTO historial_estados
         (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
       VALUES ('requerimiento', ?, ?, ?, ?, ?)`,
      [id, req.estado, nuevoEstado, usuarioId, notas]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Eliminar un requerimiento solo si está en estado 'borrador'.
 */
async function eliminar(id) {
  const [result] = await pool.query(
    "DELETE FROM requerimientos WHERE id = ? AND estado = 'borrador'",
    [id]
  );
  return result.affectedRows;
}

export { listar, obtenerPorId, crear, actualizar, cambiarEstado, eliminar };