import * as Ordenes from '../models/ordenes.js';
import pool from '../config/db.js';
import logger from '../utils/logger.js';
import {
  generarExcelBaseGral,
  estadoExcelDesdeSistema,
  formatoProveedorBaseGral,
} from '../utils/excelRequerimientos.js';
import {
  construirIndiceAreasDeptos,
  resolverAreaDepartamentoVista,
} from '../config/departamentosStore.js';

function extraerStatusNotas(notasReq, notasOc) {
  const n = String(notasReq || notasOc || '');
  const m = n.match(/Status:\s*(.+?)(?:\s*\|\s*Import:|$)/i);
  if (m) return m[1].trim();
  if (notasOc && String(notasOc).trim()) return String(notasOc).trim();
  return '';
}

function camposAreaDeptoVista(area, departamento, indice) {
  const r = resolverAreaDepartamentoVista(area, departamento, indice);
  return {
    area: r.area || '',
    departamento: r.departamento || '',
    // Compat: "depto" operativo = departamento resuelto
    depto: r.departamento || r.area || '',
  };
}

/**
 * Normaliza una fila de OC (+ REQ) al layout BASE GRAL.
 */
function filaBaseGralDesdeOc(oc, indice) {
  const ad = camposAreaDeptoVista(oc.area, oc.departamento, indice);
  return {
    orden_compra: oc.datatextnow_id || '',
    fecha_po: oc.fecha_po || null,
    consecutivo: oc.consecutivo || oc.numero_oc || '',
    created_at: oc.req_created_at || oc.created_at || null,
    tipo: oc.tipo || '',
    proveedor_num: oc.proveedor_num != null ? oc.proveedor_num : '',
    proveedor_nombre: oc.proveedor_nombre || '',
    proveedor: formatoProveedorBaseGral(oc.proveedor_num, oc.proveedor_nombre),
    total: oc.monto_total != null ? Number(oc.monto_total) : '',
    moneda: oc.moneda || '',
    usuario: oc.solicitante_nombre || '',
    estado: estadoExcelDesdeSistema({
      estado: oc.req_estado,
      oc_estado: oc.estado,
    }),
    req_estado: oc.req_estado,
    oc_estado: oc.estado,
    ...ad,
    compania: '31',
    tipo_servicio: oc.titulo_solicitud || '',
    status: extraerStatusNotas(oc.notas_req || oc.notas, oc.notas_oc),
  };
}

/**
 * Normaliza una fila de REQ (con o sin OC enlazada) al layout BASE GRAL.
 */
function filaBaseGralDesdeReq(req, indice) {
  const ad = camposAreaDeptoVista(req.area, req.departamento, indice);
  // Detalle: título + notas (sin Status) — no solo el tipo PARTES/SERVICIOS
  const titulo = String(req.titulo_solicitud || '').trim();
  let notas = String(req.notas || '').trim()
    .replace(/\s*\|\s*Status:\s*.+$/i, '')
    .replace(/^Status:\s*.+?(?:\s*\|\s*Import:.*)?$/i, '')
    .replace(/\s*\|\s*Import:.*$/i, '')
    .trim();
  const detalle = [titulo, notas && notas !== titulo ? notas : '']
    .filter(Boolean)
    .join(' | ');
  return {
    orden_compra: req.oc_datatextnow_id || '',
    fecha_po: req.oc_fecha_po || null,
    consecutivo: req.consecutivo || '',
    created_at: req.created_at || null,
    tipo: req.tipo || '',
    proveedor_num: req.proveedor_num != null ? req.proveedor_num : '',
    proveedor_nombre: req.proveedor_nombre || '',
    proveedor: formatoProveedorBaseGral(req.proveedor_num, req.proveedor_nombre),
    total: req.oc_monto_total != null ? Number(req.oc_monto_total) : '',
    moneda: req.oc_moneda || '',
    usuario: req.solicitante_nombre || '',
    estado: estadoExcelDesdeSistema({
      estado: req.estado,
      oc_estado: req.oc_estado,
    }),
    req_estado: req.estado,
    oc_estado: req.oc_estado,
    ...ad,
    compania: '31',
    tipo_servicio: detalle || titulo || notas || '',
    status: extraerStatusNotas(req.notas, null),
  };
}

/** Clave de deduplicación: N° / consecutivo (o id de OC si no hay). */
function claveFilaBaseGral(fila, fallbackId = '') {
  const n = String(fila.consecutivo || fila.n || '').trim().toUpperCase();
  if (n) return `N:${n}`;
  const po = String(fila.orden_compra || '').trim().toUpperCase();
  if (po) return `PO:${po}:${fallbackId}`;
  return `ID:${fallbackId}`;
}

/**
 * Genera el reporte de Órdenes de Compra en layout BASE GRAL.
 * - Con periodo (anual/mensual/semanal): filtros por fecha
 * - Con libre=1: exporta según filtros de listado (estado, tipo_req, busqueda, sin_po)
 * Una fila por OC (mismo layout que BASE GRAL DE REQ. 23.07.26).
 */
export async function generarReporteOrdenesCompra(req, res) {
  try {
    const {
      anio,
      mes,
      semana,
      estado,
      busqueda,
      sin_po,
      tipo_req,
      solicitante_id,
    } = req.query;

    const filtros = {};
    const now = new Date();
    const year = parseInt(anio) || now.getFullYear();
    const exportLibre = req.query.libre === '1' || req.query.libre === 'true';

    const periodoEfectivo = ['anual', 'mensual', 'semanal'].includes(String(req.query.periodo || req.query.tipo))
      ? String(req.query.periodo || req.query.tipo)
      : 'anual';

    if (!exportLibre) {
      if (periodoEfectivo === 'anual') {
        filtros.fecha_desde = `${year}-01-01`;
        filtros.fecha_hasta = `${year}-12-31`;
      } else if (periodoEfectivo === 'mensual') {
        const month = parseInt(mes) || (now.getMonth() + 1);
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0);
        filtros.fecha_desde = start.toISOString().split('T')[0];
        filtros.fecha_hasta = end.toISOString().split('T')[0];
      } else if (periodoEfectivo === 'semanal') {
        const week = parseInt(semana) || 1;
        const start = new Date(year, 0, 1 + (week - 1) * 7);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        filtros.fecha_desde = start.toISOString().split('T')[0];
        filtros.fecha_hasta = end.toISOString().split('T')[0];
      }
    }

    if (estado) filtros.estado = estado;
    if (busqueda) filtros.busqueda = busqueda;
    if (sin_po) filtros.sin_po = sin_po;
    if (tipo_req) filtros.tipo = tipo_req;
    else if (req.query.tipo && !['anual', 'mensual', 'semanal'].includes(String(req.query.tipo))) {
      filtros.tipo = req.query.tipo;
    }
    if (solicitante_id) filtros.solicitante_id = solicitante_id;

    const { datos: ocs } = await Ordenes.listar({
      ...filtros,
      limite: 10000,
    });

    const indice = await construirIndiceAreasDeptos();
    const filas = ocs.map((oc) =>
      filaBaseGralDesdeOc({
        ...oc,
        notas_req: oc.descripcion || oc.notas_req,
        notas_oc: oc.notas,
        req_estado: oc.req_estado,
        req_created_at: oc.req_created_at || oc.created_at,
      }, indice)
    );

    const buffer = generarExcelBaseGral(filas);

    const filename = exportLibre
      ? `BASE_GRAL_OC_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `BASE_GRAL_OC_${periodoEfectivo}_${year}${mes ? '_' + mes : ''}${semana ? '_sem' + semana : ''}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    logger.error('[Reporte OC BASE GRAL]', err);
    res.status(500).json({ mensaje: 'Error al generar el reporte' });
  }
}

/**
 * Dashboard / General: export BASE GRAL del año con REQ + OC.
 * - Todas las OC del año (fecha PO / autorización / creación)
 * - Todos los REQ del año (fecha de solicitud / created_at), incluidos sin OC
 * - Deduplica por N° (consecutivo): si hay OC se prioriza la fila de OC
 * Mantiene la ruta histórica /status-pos-hilos por compatibilidad de UI.
 */
export async function generarReporteStatusPOS(req, res) {
  try {
    const { anio, po, estado } = req.query;
    const year = parseInt(anio) || new Date().getFullYear();
    const likePo = po ? `%${po}%` : null;

    // ── 1) OCs del año ──────────────────────────────────────────
    let sqlOc = `
      SELECT
        oc.id,
        oc.numero_oc,
        oc.datatextnow_id,
        oc.fecha_po,
        oc.fecha_autorizacion,
        oc.estado,
        oc.monto_total,
        oc.moneda,
        oc.notas AS notas_oc,
        oc.created_at,
        r.consecutivo,
        r.tipo,
        r.titulo_solicitud,
        r.notas AS notas_req,
        r.area,
        r.departamento,
        r.estado AS req_estado,
        r.created_at AS req_created_at,
        u.nombre AS solicitante_nombre,
        p.num_proveedor AS proveedor_num,
        p.nombre AS proveedor_nombre
      FROM ordenes_compra oc
      JOIN requerimientos r ON r.id = oc.requerimiento_id
      LEFT JOIN usuarios u ON u.id = r.solicitante_id
      LEFT JOIN proveedores p ON p.id = oc.proveedor_id
      WHERE YEAR(COALESCE(oc.fecha_po, oc.fecha_autorizacion, oc.created_at)) = ?
    `;
    const paramsOc = [year];

    if (likePo) {
      sqlOc += ` AND (oc.datatextnow_id LIKE ? OR oc.numero_oc LIKE ? OR r.consecutivo LIKE ?) `;
      paramsOc.push(likePo, likePo, likePo);
    }
    if (estado) {
      sqlOc += ` AND oc.estado = ? `;
      paramsOc.push(estado);
    }
    sqlOc += ` ORDER BY COALESCE(oc.fecha_po, oc.fecha_autorizacion, oc.created_at) ASC, r.consecutivo ASC `;

    // ── 2) REQs del año (con o sin OC) ───────────────────────────
    // Incluye REQ creados en el año; la OC enlazada (si existe) enriquece la fila.
    let sqlReq = `
      SELECT
        r.id,
        r.consecutivo,
        r.tipo,
        r.titulo_solicitud,
        r.notas,
        r.area,
        r.departamento,
        r.estado,
        r.created_at,
        u.nombre AS solicitante_nombre,
        oc.id AS oc_id,
        oc.numero_oc AS oc_numero,
        oc.estado AS oc_estado,
        COALESCE(oc.monto_total, cot.monto_total) AS oc_monto_total,
        COALESCE(oc.moneda, cot.moneda) AS oc_moneda,
        oc.datatextnow_id AS oc_datatextnow_id,
        oc.fecha_po AS oc_fecha_po,
        COALESCE(p_oc.num_proveedor, p_cot.num_proveedor, p_cat.num_proveedor) AS proveedor_num,
        COALESCE(p_oc.nombre, p_cot.nombre, p_cat.nombre) AS proveedor_nombre
      FROM requerimientos r
      JOIN usuarios u ON u.id = r.solicitante_id
      LEFT JOIN ordenes_compra oc ON oc.id = r.orden_compra_id
      LEFT JOIN cotizaciones cot ON cot.requerimiento_id = r.id
        AND (cot.seleccionada = 1 OR cot.estado = 'seleccionada')
      LEFT JOIN proveedores p_oc  ON p_oc.id  = oc.proveedor_id
      LEFT JOIN proveedores p_cot ON p_cot.id = cot.proveedor_id
      LEFT JOIN proveedores p_cat ON p_cat.id = (
        SELECT cat.proveedor_id
        FROM requerimiento_items ri
        JOIN catalogo cat ON cat.id = ri.catalogo_id
        WHERE ri.requerimiento_id = r.id AND cat.proveedor_id IS NOT NULL
        LIMIT 1
      )
      WHERE YEAR(r.created_at) = ?
    `;
    const paramsReq = [year];

    if (likePo) {
      sqlReq += ` AND (
        r.consecutivo LIKE ?
        OR oc.datatextnow_id LIKE ?
        OR oc.numero_oc LIKE ?
      ) `;
      paramsReq.push(likePo, likePo, likePo);
    }
    if (estado) {
      // En General, si filtran estado de OC, solo REQs cuya OC coincida (o sin filtro de solo-REQ)
      sqlReq += ` AND oc.estado = ? `;
      paramsReq.push(estado);
    }
    sqlReq += ` ORDER BY r.created_at ASC, r.consecutivo ASC `;

    const [resOc, resReq] = await Promise.all([
      pool.query(sqlOc, paramsOc),
      pool.query(sqlReq, paramsReq),
    ]);
    const rowsOc = resOc[0];
    const rowsReq = resReq[0];

    // ── 3) Unir: primero OCs del año; luego REQs no cubiertos ───
    const mapa = new Map();
    const indice = await construirIndiceAreasDeptos();

    for (const row of rowsOc) {
      const fila = filaBaseGralDesdeOc(row, indice);
      const key = claveFilaBaseGral(fila, `oc-${row.id}`);
      mapa.set(key, fila);
    }

    for (const row of rowsReq) {
      const fila = filaBaseGralDesdeReq(row, indice);
      const key = claveFilaBaseGral(fila, `req-${row.id}`);
      // Si ya hay fila por OC del mismo N°, no duplicar (la de OC tiene más datos de compra)
      if (mapa.has(key)) continue;
      mapa.set(key, fila);
    }

    const filas = [...mapa.values()].sort((a, b) => {
      const fa = a.fecha_po || a.created_at || '';
      const fb = b.fecha_po || b.created_at || '';
      const cmp = String(fa).localeCompare(String(fb));
      if (cmp !== 0) return cmp;
      return String(a.consecutivo || '').localeCompare(String(b.consecutivo || ''), 'es', {
        numeric: true,
      });
    });

    const buffer = generarExcelBaseGral(filas);
    const filename = `BASE_GRAL_${year}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    logger.error('[Reporte BASE GRAL dashboard]', err);
    res.status(500).json({ mensaje: 'Error al generar el reporte BASE GRAL' });
  }
}
