import pool from '../config/db.js';
import logger from '../utils/logger.js';

/**
 * GET /api/notificaciones/bandeja
 * Compras/Admin: REQs en revisión (bandeja de entrada).
 * Solicitante: sus REQs en revisión o incompletos (seguimiento).
 */
export async function bandeja(req, res) {
  try {
    const rol = String(req.usuario?.rol || '').toLowerCase();
    const esCompras = rol === 'compras' || rol === 'admin';
    const limite = Math.min(parseInt(req.query.limite, 10) || 20, 50);

    if (esCompras) {
      // Prioridad: pendientes de acuse (en_revision). Incluye recibidos en proceso si no hay por recibir.
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM requerimientos WHERE estado = 'en_revision'`
      );
      const [[{ recibidos }]] = await pool.query(
        `SELECT COUNT(*) AS recibidos FROM requerimientos WHERE estado = 'recibido'`
      );
      const [[{ hoy }]] = await pool.query(
        `SELECT COUNT(*) AS hoy FROM requerimientos
         WHERE estado = 'en_revision' AND DATE(updated_at) = CURDATE()`
      );
      const [items] = await pool.query(
        `SELECT r.id, r.consecutivo, r.tipo, r.titulo_solicitud, r.estado,
                r.area, r.departamento, r.created_at, r.updated_at,
                u.nombre AS solicitante_nombre
         FROM requerimientos r
         JOIN usuarios u ON u.id = r.solicitante_id
         WHERE r.estado IN ('en_revision', 'recibido')
         ORDER BY
           CASE r.estado WHEN 'en_revision' THEN 0 ELSE 1 END,
           r.updated_at DESC
         LIMIT ?`,
        [limite]
      );
      return res.json({
        tipo: 'compras',
        total: Number(total) || 0,
        recibidos: Number(recibidos) || 0,
        nuevos_hoy: Number(hoy) || 0,
        items,
        link_todos: 'requerimientos.html?estado=en_revision',
      });
    }

    // Solicitante: seguimiento (pendiente acuse, recibido por Compras, o incompleto)
    const uid = req.usuario.id;
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM requerimientos
       WHERE solicitante_id = ? AND estado IN ('en_revision', 'recibido', 'incompleto')`,
      [uid]
    );
    const [items] = await pool.query(
      `SELECT r.id, r.consecutivo, r.tipo, r.titulo_solicitud, r.estado,
              r.area, r.departamento, r.created_at, r.updated_at,
              u.nombre AS solicitante_nombre
       FROM requerimientos r
       JOIN usuarios u ON u.id = r.solicitante_id
       WHERE r.solicitante_id = ? AND r.estado IN ('en_revision', 'recibido', 'incompleto')
       ORDER BY
         CASE r.estado WHEN 'incompleto' THEN 0 WHEN 'en_revision' THEN 1 ELSE 2 END,
         r.updated_at DESC
       LIMIT ?`,
      [uid, limite]
    );
    return res.json({
      tipo: 'solicitante',
      total: Number(total) || 0,
      nuevos_hoy: 0,
      items,
      link_todos: 'requerimientos.html?estado=activos',
    });
  } catch (err) {
    logger.error('[notificaciones.bandeja]', err);
    res.status(500).json({ mensaje: 'Error al cargar notificaciones' });
  }
}
