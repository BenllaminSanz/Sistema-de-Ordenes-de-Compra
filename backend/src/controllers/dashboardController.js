import pool from '../config/db.js';

/**
 * GET /api/dashboard/stats
 * Ejecuta todas las queries agregadas en paralelo y devuelve los KPIs del dashboard.
 * Acepta ?anio=YYYY para filtrar por año (default: año actual).
 */
export async function getStats(req, res, next) {
  try {
    const anio = parseInt(req.query.anio) || new Date().getFullYear();

    const [
      estadosReq,
      estadosOC,
      gastoPorTipo,
      topProveedores,
      topDepartamentos,
      cicloPromedio,
      agingReqs,
      ocSinRecibir,
      volumenMensual,
    ] = await Promise.all([

      // 1. Requerimientos por estado (total histórico)
      pool.query(`
        SELECT estado, COUNT(*) AS total
        FROM requerimientos
        GROUP BY estado
      `),

      // 2. OC por estado (total histórico)
      pool.query(`
        SELECT estado, COUNT(*) AS total
        FROM ordenes_compra
        GROUP BY estado
      `),

      // 3. Gasto por tipo y moneda — año seleccionado
      pool.query(`
        SELECT r.tipo, oc.moneda,
               COUNT(oc.id)           AS num_oc,
               SUM(oc.monto_total)    AS total
        FROM ordenes_compra oc
        JOIN requerimientos r ON r.id = oc.requerimiento_id
        WHERE oc.monto_total IS NOT NULL
          AND YEAR(COALESCE(oc.fecha_autorizacion, oc.created_at)) = ?
        GROUP BY r.tipo, oc.moneda
        ORDER BY total DESC
      `, [anio]),

      // 4. Top 8 proveedores por gasto — año seleccionado
      pool.query(`
        SELECT p.nombre AS proveedor,
               p.num_proveedor,
               oc.moneda,
               COUNT(oc.id)        AS num_oc,
               SUM(oc.monto_total) AS total
        FROM ordenes_compra oc
        JOIN proveedores p ON p.id = oc.proveedor_id
        WHERE oc.monto_total IS NOT NULL
          AND YEAR(COALESCE(oc.fecha_autorizacion, oc.created_at)) = ?
        GROUP BY oc.proveedor_id, oc.moneda
        ORDER BY total DESC
        LIMIT 8
      `, [anio]),

      // 5. Top 10 departamentos por volumen de requerimientos — año seleccionado
      pool.query(`
        SELECT departamento,
               COUNT(*) AS total,
               SUM(CASE WHEN estado NOT IN ('rechazado','borrador') THEN 1 ELSE 0 END) AS aprobados
        FROM requerimientos
        WHERE departamento IS NOT NULL
          AND YEAR(created_at) = ?
        GROUP BY departamento
        ORDER BY total DESC
        LIMIT 10
      `, [anio]),

      // 6. Ciclo promedio real: días entre creación del req y creación de la OC
      pool.query(`
        SELECT ROUND(AVG(DATEDIFF(oc.created_at, r.created_at)), 1) AS dias_promedio,
               MIN(DATEDIFF(oc.created_at, r.created_at))           AS dias_min,
               MAX(DATEDIFF(oc.created_at, r.created_at))           AS dias_max
        FROM ordenes_compra oc
        JOIN requerimientos r ON r.id = oc.requerimiento_id
        WHERE YEAR(COALESCE(oc.fecha_autorizacion, oc.created_at)) = ?
          AND DATEDIFF(oc.created_at, r.created_at) >= 0
      `, [anio]),

      // 7. Requerimientos en_revision más antiguos (alertas de aging)
      pool.query(`
        SELECT r.id, r.consecutivo, r.departamento, r.tipo,
               u.nombre AS solicitante,
               DATEDIFF(NOW(), r.created_at) AS dias_espera
        FROM requerimientos r
        JOIN usuarios u ON u.id = r.solicitante_id
        WHERE r.estado = 'en_revision'
        ORDER BY dias_espera DESC
        LIMIT 8
      `),

      // 8. OC pendientes de recibir (en vuelo)
      pool.query(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN oc.monto_total IS NOT NULL THEN oc.monto_total ELSE 0 END) AS monto_comprometido,
               oc.moneda
        FROM ordenes_compra oc
        WHERE oc.estado IN ('generada', 'distribuida', 'en_proceso')
        GROUP BY oc.moneda
      `),

      // 9. Volumen mensual de OC — año seleccionado (para mini sparkline)
      pool.query(`
        SELECT MONTH(COALESCE(oc.fecha_autorizacion, oc.created_at)) AS mes,
               COUNT(*)               AS num_oc,
               SUM(oc.monto_total)    AS total_mxn
        FROM ordenes_compra oc
        WHERE YEAR(COALESCE(oc.fecha_autorizacion, oc.created_at)) = ?
          AND oc.moneda = 'MXN'
        GROUP BY mes
        ORDER BY mes ASC
      `, [anio]),

    ]);

    res.json({
      anio,
      estados_req:      estadosReq[0],
      estados_oc:       estadosOC[0],
      gasto_por_tipo:   gastoPorTipo[0],
      top_proveedores:  topProveedores[0],
      top_departamentos: topDepartamentos[0],
      ciclo:            cicloPromedio[0][0],
      aging_reqs:       agingReqs[0],
      oc_sin_recibir:   ocSinRecibir[0],
      volumen_mensual:  volumenMensual[0],
    });

  } catch (err) {
    next(err);
  }
}
