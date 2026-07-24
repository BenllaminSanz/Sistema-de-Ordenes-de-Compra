import pool from '../config/db.js';

/**
 * GET /api/dashboard/stats
 * Queries agregadas del dashboard.
 * ?anio=YYYY filtra métricas de año (default: año actual).
 *
 * Notas post-carga histórica:
 * - El import BASE GRAL guarda el depto en `requerimientos.area` (departamento suele ir vacío).
 * - Ciclo real se calcula con fecha_po / fecha solicitud, no solo created_at (import crea ambos el mismo día).
 */
export async function getStats(req, res, next) {
  try {
    const anio = parseInt(req.query.anio, 10) || new Date().getFullYear();

    // Depto operativo: departamento del formulario o area del Excel histórico
    const deptoExpr = `COALESCE(NULLIF(TRIM(r.departamento), ''), NULLIF(TRIM(r.area), ''))`;

    const [
      estadosReqAnio,
      estadosReqHist,
      estadosOCAnio,
      estadosOCHist,
      gastoPorTipo,
      topProveedores,
      topDepartamentos,
      cicloPromedio,
      agingReqs,
      ocActivasResumen,
      ocSinRecibir,
      volumenMensual,
      reqActivosAnio,
    ] = await Promise.all([

      // 1a. REQ por estado — año (created_at)
      pool.query(`
        SELECT estado, COUNT(*) AS total
        FROM requerimientos
        WHERE YEAR(created_at) = ?
        GROUP BY estado
      `, [anio]),

      // 1b. REQ por estado — histórico total (referencia)
      pool.query(`
        SELECT estado, COUNT(*) AS total
        FROM requerimientos
        GROUP BY estado
      `),

      // 2a. OC por estado — año (fecha_po o auth/created)
      pool.query(`
        SELECT estado, COUNT(*) AS total
        FROM ordenes_compra
        WHERE YEAR(COALESCE(fecha_po, fecha_autorizacion, created_at)) = ?
        GROUP BY estado
      `, [anio]),

      // 2b. OC por estado — histórico
      pool.query(`
        SELECT estado, COUNT(*) AS total
        FROM ordenes_compra
        GROUP BY estado
      `),

      // 3. Gasto por tipo y moneda — año
      pool.query(`
        SELECT r.tipo, oc.moneda,
               COUNT(oc.id)           AS num_oc,
               SUM(oc.monto_total)    AS total
        FROM ordenes_compra oc
        JOIN requerimientos r ON r.id = oc.requerimiento_id
        WHERE oc.monto_total IS NOT NULL
          AND YEAR(COALESCE(oc.fecha_po, oc.fecha_autorizacion, oc.created_at)) = ?
        GROUP BY r.tipo, oc.moneda
        ORDER BY total DESC
      `, [anio]),

      // 4. Top 8 proveedores por gasto — año
      pool.query(`
        SELECT p.nombre AS proveedor,
               p.num_proveedor,
               oc.moneda,
               COUNT(oc.id)        AS num_oc,
               SUM(oc.monto_total) AS total
        FROM ordenes_compra oc
        JOIN proveedores p ON p.id = oc.proveedor_id
        WHERE oc.monto_total IS NOT NULL
          AND YEAR(COALESCE(oc.fecha_po, oc.fecha_autorizacion, oc.created_at)) = ?
        GROUP BY oc.proveedor_id, oc.moneda
        ORDER BY total DESC
        LIMIT 8
      `, [anio]),

      // 5. Top 10 deptos/áreas por volumen REQ — año
      //    Usa area del Excel si departamento está vacío.
      //    GROUP BY debe repetir la expresión (sql_mode=ONLY_FULL_GROUP_BY).
      pool.query(`
        SELECT ${deptoExpr} AS departamento,
               COUNT(*) AS total,
               SUM(CASE WHEN r.estado NOT IN ('rechazado','borrador') THEN 1 ELSE 0 END) AS aprobados,
               SUM(CASE WHEN r.estado = 'cerrado' THEN 1 ELSE 0 END) AS cerrados,
               SUM(CASE WHEN r.estado IN ('en_revision','aprobado','incompleto','borrador') THEN 1 ELSE 0 END) AS abiertos
        FROM requerimientos r
        WHERE ${deptoExpr} IS NOT NULL
          AND YEAR(r.created_at) = ?
        GROUP BY ${deptoExpr}
        ORDER BY total DESC
        LIMIT 10
      `, [anio]),

      // 6. Ciclo promedio: días entre fecha solicitud (req) y fecha PO (o creación OC)
      //    Ignora pares con 0 días masivos del import si hay fecha_po distinta
      pool.query(`
        SELECT
          ROUND(AVG(dias), 1) AS dias_promedio,
          MIN(dias)           AS dias_min,
          MAX(dias)           AS dias_max,
          COUNT(*)            AS muestra
        FROM (
          SELECT DATEDIFF(
                   COALESCE(oc.fecha_po, DATE(oc.fecha_autorizacion), DATE(oc.created_at)),
                   DATE(r.created_at)
                 ) AS dias
          FROM ordenes_compra oc
          JOIN requerimientos r ON r.id = oc.requerimiento_id
          WHERE YEAR(COALESCE(oc.fecha_po, oc.fecha_autorizacion, oc.created_at)) = ?
        ) t
        WHERE dias IS NOT NULL AND dias >= 0
      `, [anio]),

      // 7. Aging: REQ en_revision (y opcionalmente aprobado sin OC) más antiguos
      pool.query(`
        SELECT r.id, r.consecutivo, r.tipo,
               ${deptoExpr} AS departamento,
               r.area,
               u.nombre AS solicitante,
               r.estado,
               DATEDIFF(NOW(), r.created_at) AS dias_espera
        FROM requerimientos r
        JOIN usuarios u ON u.id = r.solicitante_id
        WHERE r.estado IN ('en_revision', 'aprobado', 'incompleto')
        ORDER BY
          CASE r.estado WHEN 'en_revision' THEN 0 WHEN 'incompleto' THEN 1 ELSE 2 END,
          dias_espera DESC
        LIMIT 12
      `),

      // 8. Resumen OC activas (desglose para KPI)
      pool.query(`
        SELECT estado, COUNT(*) AS total,
               ROUND(SUM(CASE WHEN monto_total IS NOT NULL THEN monto_total ELSE 0 END), 2) AS monto,
               moneda
        FROM ordenes_compra
        WHERE estado IN ('generada', 'distribuida', 'en_proceso', 'recibida')
        GROUP BY estado, moneda
        ORDER BY estado, moneda
      `),

      // 9. OC pendientes de recibir (monto comprometido por moneda)
      pool.query(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN oc.monto_total IS NOT NULL THEN oc.monto_total ELSE 0 END) AS monto_comprometido,
               oc.moneda
        FROM ordenes_compra oc
        WHERE oc.estado IN ('generada', 'distribuida', 'en_proceso', 'recibida')
        GROUP BY oc.moneda
      `),

      // 10. Volumen mensual — preferir fecha_po
      pool.query(`
        SELECT MONTH(COALESCE(oc.fecha_po, oc.fecha_autorizacion, oc.created_at)) AS mes,
               COUNT(*)               AS num_oc,
               SUM(CASE WHEN oc.moneda = 'MXN' THEN oc.monto_total ELSE 0 END) AS total_mxn,
               SUM(CASE WHEN oc.moneda = 'USD' THEN oc.monto_total ELSE 0 END) AS total_usd,
               SUM(CASE WHEN oc.moneda = 'EUR' THEN oc.monto_total ELSE 0 END) AS total_eur
        FROM ordenes_compra oc
        WHERE YEAR(COALESCE(oc.fecha_po, oc.fecha_autorizacion, oc.created_at)) = ?
        GROUP BY mes
        ORDER BY mes ASC
      `, [anio]),

      // 11. REQ activos (no cerrados) del año — para KPI operativo
      pool.query(`
        SELECT estado, COUNT(*) AS total
        FROM requerimientos
        WHERE estado <> 'cerrado'
          AND YEAR(created_at) = ?
        GROUP BY estado
      `, [anio]),

    ]);

    res.json({
      anio,
      // Por año (para KPIs del selector)
      estados_req: estadosReqAnio[0],
      estados_oc: estadosOCAnio[0],
      // Histórico (referencia / barras globales)
      estados_req_hist: estadosReqHist[0],
      estados_oc_hist: estadosOCHist[0],
      gasto_por_tipo: gastoPorTipo[0],
      top_proveedores: topProveedores[0],
      top_departamentos: topDepartamentos[0],
      ciclo: cicloPromedio[0][0],
      aging_reqs: agingReqs[0],
      oc_activas_resumen: ocActivasResumen[0],
      oc_sin_recibir: ocSinRecibir[0],
      volumen_mensual: volumenMensual[0],
      req_activos_anio: reqActivosAnio[0],
    });
  } catch (err) {
    next(err);
  }
}
