import pool from '../config/db.js';

export const registrarHistorial = async (data) => {
  try {
    const {
      entidad_tipo,
      entidad_id,
      estado_anterior,
      estado_nuevo,
      cambiado_por,
      notas
    } = data;

    const [result] = await pool.query(`
      INSERT INTO historial_estados 
        (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entidad_tipo,
        entidad_id,
        estado_anterior,
        estado_nuevo,
        cambiado_por,
        notas || null
      ]
    );

    return result.insertId;
  } catch (error) {
    console.error('Error al registrar historial:', error);
    // No lanzamos error para no romper el flujo principal
    return null;
  }
};

/**
 * Nota de seguimiento en el REQ sin cambiar el estado
 * (p. ej. "Cotización enviada al proveedor X el …").
 * Queda visible como último estatus y en el timeline.
 */
export async function registrarNotaSeguimientoReq({
  requerimientoId,
  usuarioId,
  notas,
}) {
  if (!requerimientoId || !notas) return null;
  try {
    const [[req]] = await pool.query(
      'SELECT id, estado FROM requerimientos WHERE id = ?',
      [requerimientoId]
    );
    if (!req) return null;

    return registrarHistorial({
      entidad_tipo: 'requerimiento',
      entidad_id: requerimientoId,
      estado_anterior: req.estado,
      estado_nuevo: req.estado,
      cambiado_por: usuarioId || 1,
      notas: String(notas).slice(0, 1000),
    });
  } catch (error) {
    console.error('Error al registrar nota de seguimiento REQ:', error);
    return null;
  }
}

export default { registrarHistorial, registrarNotaSeguimientoReq };