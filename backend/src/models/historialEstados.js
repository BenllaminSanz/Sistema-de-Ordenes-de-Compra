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

export default { registrarHistorial };