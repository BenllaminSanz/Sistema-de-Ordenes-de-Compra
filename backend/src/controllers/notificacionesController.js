import pool from '../config/db.js';
import logger from '../utils/logger.js';

/**
 * Colas de trabajo de la bandeja (Compras/Admin).
 * por_recibir  → en_revision (acuse pendiente)
 * en_proceso   → recibido
 * incompletos  → incompleto
 * listos_oc    → aprobado sin OC generada
 */
const COLAS_COMPRAS = {
  por_recibir: {
    where: `r.estado = 'en_revision'`,
    link: 'requerimientos.html?estado=en_revision',
  },
  en_proceso: {
    where: `r.estado = 'recibido'`,
    link: 'requerimientos.html?estado=recibido',
  },
  incompletos: {
    where: `r.estado = 'incompleto'`,
    link: 'requerimientos.html?estado=incompleto',
  },
  listos_oc: {
    where: `r.estado = 'aprobado' AND r.orden_compra_id IS NULL`,
    link: 'requerimientos.html?estado=aprobado',
  },
};

/**
 * GET /api/notificaciones/bandeja
 * Query: cola=por_recibir|en_proceso|incompletos|listos_oc (compras)
 *        cola=pendientes|incompletos (solicitante)
 *        limite=1..50
 *
 * Compras/Admin: colas de trabajo + ítems con antigüedad.
 * Solicitante (campana): seguimiento de SUS REQ (`avisos`).
 * `?vista=general`: mismas colas globales (Dashboard para todos; solo consulta).
 */
export async function bandeja(req, res) {
  try {
    const rol = String(req.usuario?.rol || '').toLowerCase();
    const esCompras = rol === 'compras' || rol === 'admin';
    const vistaGeneral = String(req.query.vista || '').toLowerCase() === 'general';
    const limite = Math.min(parseInt(req.query.limite, 10) || 25, 50);
    const colaRaw = String(req.query.cola || '').trim().toLowerCase();

    if (esCompras || vistaGeneral) {
      return await bandejaCompras(res, colaRaw, limite);
    }
    return await bandejaSolicitante(res, req.usuario.id, colaRaw, limite);
  } catch (err) {
    logger.error('[notificaciones.bandeja]', err);
    res.status(500).json({ mensaje: 'Error al cargar notificaciones' });
  }
}

async function bandejaCompras(res, colaRaw, limite) {
  const [[{ por_recibir }]] = await pool.query(
    `SELECT COUNT(*) AS por_recibir FROM requerimientos WHERE estado = 'en_revision'`
  );
  const [[{ en_proceso }]] = await pool.query(
    `SELECT COUNT(*) AS en_proceso FROM requerimientos WHERE estado = 'recibido'`
  );
  const [[{ incompletos }]] = await pool.query(
    `SELECT COUNT(*) AS incompletos FROM requerimientos WHERE estado = 'incompleto'`
  );
  const [[{ listos_oc }]] = await pool.query(
    `SELECT COUNT(*) AS listos_oc FROM requerimientos
     WHERE estado = 'aprobado' AND orden_compra_id IS NULL`
  );
  const [[{ nuevos_hoy }]] = await pool.query(
    `SELECT COUNT(*) AS nuevos_hoy FROM requerimientos
     WHERE estado = 'en_revision' AND DATE(updated_at) = CURDATE()`
  );

  const contadores = {
    por_recibir: Number(por_recibir) || 0,
    en_proceso: Number(en_proceso) || 0,
    incompletos: Number(incompletos) || 0,
    listos_oc: Number(listos_oc) || 0,
    nuevos_hoy: Number(nuevos_hoy) || 0,
  };

  // Cola por defecto: la primera con pendientes (prioridad operativa)
  let cola = colaRaw;
  if (!COLAS_COMPRAS[cola]) {
    if (contadores.por_recibir > 0) cola = 'por_recibir';
    else if (contadores.en_proceso > 0) cola = 'en_proceso';
    else if (contadores.incompletos > 0) cola = 'incompletos';
    else if (contadores.listos_oc > 0) cola = 'listos_oc';
    else cola = 'por_recibir';
  }

  const def = COLAS_COMPRAS[cola];
  const [items] = await pool.query(
    `SELECT r.id, r.consecutivo, r.tipo, r.titulo_solicitud, r.estado,
            r.area, r.departamento, r.requiere_cotizacion,
            r.created_at, r.updated_at,
            DATEDIFF(NOW(), r.created_at) AS dias_espera,
            u.nombre AS solicitante_nombre
     FROM requerimientos r
     JOIN usuarios u ON u.id = r.solicitante_id
     WHERE ${def.where}
     ORDER BY r.created_at ASC
     LIMIT ?`,
    [limite]
  );

  return res.json({
    tipo: 'compras',
    cola,
    contadores,
    // Compat campana: badge = pendientes de acuse
    total: contadores.por_recibir,
    recibidos: contadores.en_proceso,
    nuevos_hoy: contadores.nuevos_hoy,
    items,
    link_todos: def.link,
    link_dashboard: 'dashboard.html#bandeja',
  });
}

async function bandejaSolicitante(res, uid, colaRaw, limite) {
  const [[{ pendientes }]] = await pool.query(
    `SELECT COUNT(*) AS pendientes FROM requerimientos
     WHERE solicitante_id = ? AND estado IN ('en_revision', 'recibido')`,
    [uid]
  );
  const [[{ incompletos }]] = await pool.query(
    `SELECT COUNT(*) AS incompletos FROM requerimientos
     WHERE solicitante_id = ? AND estado = 'incompleto'`,
    [uid]
  );
  const [[{ en_proceso }]] = await pool.query(
    `SELECT COUNT(*) AS en_proceso FROM requerimientos
     WHERE solicitante_id = ? AND estado = 'recibido'`,
    [uid]
  );
  const [[{ por_recibir }]] = await pool.query(
    `SELECT COUNT(*) AS por_recibir FROM requerimientos
     WHERE solicitante_id = ? AND estado = 'en_revision'`,
    [uid]
  );

  const contadores = {
    por_recibir: Number(por_recibir) || 0,
    en_proceso: Number(en_proceso) || 0,
    incompletos: Number(incompletos) || 0,
    pendientes: (Number(por_recibir) || 0) + (Number(en_proceso) || 0) + (Number(incompletos) || 0),
    listos_oc: 0,
    nuevos_hoy: 0,
  };

  let cola = colaRaw;
  if (!['pendientes', 'incompletos', 'por_recibir', 'en_proceso'].includes(cola)) {
    cola = contadores.incompletos > 0 ? 'incompletos' : 'pendientes';
  }

  let where = `r.solicitante_id = ? AND r.estado IN ('en_revision', 'recibido', 'incompleto')`;
  if (cola === 'incompletos') {
    where = `r.solicitante_id = ? AND r.estado = 'incompleto'`;
  } else if (cola === 'por_recibir') {
    where = `r.solicitante_id = ? AND r.estado = 'en_revision'`;
  } else if (cola === 'en_proceso') {
    where = `r.solicitante_id = ? AND r.estado = 'recibido'`;
  }

  const [items] = await pool.query(
    `SELECT r.id, r.consecutivo, r.tipo, r.titulo_solicitud, r.estado,
            r.area, r.departamento, r.requiere_cotizacion,
            r.created_at, r.updated_at,
            DATEDIFF(NOW(), r.created_at) AS dias_espera,
            u.nombre AS solicitante_nombre
     FROM requerimientos r
     JOIN usuarios u ON u.id = r.solicitante_id
     WHERE ${where}
     ORDER BY
       CASE r.estado WHEN 'incompleto' THEN 0 WHEN 'en_revision' THEN 1 ELSE 2 END,
       r.created_at ASC
     LIMIT ?`,
    [uid, limite]
  );

  const avisos = await listarAvisosSolicitante(uid, limite);

  return res.json({
    tipo: 'solicitante',
    cola,
    contadores,
    total: avisos.length || contadores.pendientes,
    pendientes: contadores.pendientes,
    nuevos_hoy: 0,
    items,
    avisos,
    link_todos: 'requerimientos.html?estado=activos',
    link_dashboard: 'dashboard.html#bandeja',
  });
}

/**
 * Novedades in-app para el solicitante (sin correo):
 * nota de Compras, incompleto, aprobado, OC generada.
 */
function clasificarAvisoHistorial(h) {
  const notas = String(h.notas || '').trim();
  const mismoEstado = h.estado_anterior && h.estado_anterior === h.estado_nuevo;
  if (h.estado_nuevo === 'cerrado' && /OC|orden de compra/i.test(notas)) {
    return {
      tipo_evento: 'oc_generada',
      etiqueta: 'OC generada',
      resumen: notas || 'Se generó una orden de compra de tu requerimiento.',
    };
  }
  if (h.estado_nuevo === 'incompleto' && h.estado_anterior !== 'incompleto') {
    return {
      tipo_evento: 'incompleto',
      etiqueta: 'Incompleto',
      resumen: notas || 'Compras marcó el requerimiento como incompleto.',
    };
  }
  if (h.estado_nuevo === 'aprobado' && h.estado_anterior !== 'aprobado') {
    return {
      tipo_evento: 'aprobado',
      etiqueta: 'Aprobado',
      resumen: notas || 'Tu requerimiento fue aprobado.',
    };
  }
  if (mismoEstado && notas) {
    return {
      tipo_evento: 'nota',
      etiqueta: 'Nueva nota',
      resumen: notas,
    };
  }
  return null;
}

async function listarAvisosSolicitante(uid, limite) {
  if (!uid) return [];
  const [rows] = await pool.query(
    `SELECT h.id, h.estado_anterior, h.estado_nuevo, h.notas, h.created_at, h.cambiado_por,
            r.id AS requerimiento_id, r.consecutivo, r.tipo, r.titulo_solicitud, r.estado,
            u.nombre AS autor_nombre
     FROM historial_estados h
     JOIN requerimientos r ON r.id = h.entidad_id AND h.entidad_tipo = 'requerimiento'
     LEFT JOIN usuarios u ON u.id = h.cambiado_por
     WHERE r.solicitante_id = ?
       AND (h.cambiado_por IS NULL OR h.cambiado_por <> ?)
       AND h.created_at >= DATE_SUB(NOW(), INTERVAL 21 DAY)
     ORDER BY h.created_at DESC
     LIMIT 80`,
    [uid, uid]
  );

  const avisos = [];
  for (const h of rows || []) {
    const ev = clasificarAvisoHistorial(h);
    if (!ev) continue;
    avisos.push({
      id: `aviso-${h.id}`,
      historial_id: h.id,
      requerimiento_id: h.requerimiento_id,
      consecutivo: h.consecutivo,
      tipo: h.tipo,
      titulo_solicitud: h.titulo_solicitud,
      estado: h.estado,
      created_at: h.created_at,
      autor_nombre: h.autor_nombre,
      ...ev,
    });
    if (avisos.length >= limite) break;
  }
  return avisos;
}

export async function dispararPurgaBorradores(req, res) {
  try {
    const rol = String(req.usuario?.rol || '').toLowerCase();
    if (rol !== 'admin') {
      return res.status(403).json({ mensaje: 'Solo Admin puede ejecutar la purga de mantenimiento' });
    }
    const { ejecutarPurgaBorradores } = await import('../utils/purgaBorradores.js');
    const result = await ejecutarPurgaBorradores({
      forzar: true,
      actorUserId: req.usuario?.id,
    });
    res.json(result);
  } catch (err) {
    logger.error('[notificaciones.purgaBorradores]', err);
    res.status(500).json({ mensaje: err.message || 'Error al purgar borradores' });
  }
}

export async function dispararReporteDiario(req, res) {
  try {
    const rol = String(req.usuario?.rol || '').toLowerCase();
    if (rol !== 'admin') {
      return res.status(403).json({ mensaje: 'Solo Admin puede enviar el reporte de prueba' });
    }
    const email = String(req.usuario?.email || '').trim().toLowerCase();
    if (!email.includes('@')) {
      return res.status(400).json({ mensaje: 'Tu usuario Admin no tiene un correo válido' });
    }
    const { enviarReporteDiarioCompras } = await import('../utils/emailService.js');
    const result = await enviarReporteDiarioCompras({
      forzar: true,
      prueba: true,
      soloDestinatarios: [email],
    });
    res.json({
      ...result,
      mensaje: result?.success
        ? `Reporte de prueba enviado solo a ${email}`
        : (result?.mensaje || 'No se pudo enviar el reporte de prueba'),
    });
  } catch (err) {
    logger.error('[notificaciones.reporteDiario]', err);
    res.status(500).json({ mensaje: err.message || 'Error al enviar el reporte diario' });
  }
}

/** PO vacío o NA = sin PO real de DataTextNow */
const SQL_SIN_PO = `(
  oc.datatextnow_id IS NULL
  OR TRIM(oc.datatextnow_id) = ''
  OR UPPER(TRIM(oc.datatextnow_id)) = 'NA'
)`;

const ESTADOS_OC_ACTIVAS = ['generada', 'distribuida', 'en_proceso', 'recibida'];

const COLAS_OC = {
  generada: {
    where: `oc.estado = 'generada'`,
    link: 'ordenes.html?estado=generada',
  },
  distribuida: {
    where: `oc.estado = 'distribuida'`,
    link: 'ordenes.html?estado=distribuida',
  },
  en_proceso: {
    where: `oc.estado = 'en_proceso'`,
    link: 'ordenes.html?estado=en_proceso',
  },
  recibida: {
    where: `oc.estado = 'recibida'`,
    link: 'ordenes.html?estado=recibida',
  },
  sin_po: {
    where: `oc.estado IN ('generada','distribuida','en_proceso','recibida') AND ${SQL_SIN_PO}`,
    link: 'ordenes.html?estado=activas',
  },
};

/**
 * GET /api/notificaciones/bandeja-oc
 * Colas de trabajo de órdenes de compra (Dashboard).
 * Query: cola=generada|distribuida|en_proceso|recibida|sin_po
 */
export async function bandejaOc(req, res) {
  try {
    const limite = Math.min(parseInt(req.query.limite, 10) || 25, 50);
    const colaRaw = String(req.query.cola || '').trim().toLowerCase();

    const filtroSol = '';
    const paramsSol = [];

    const countEstado = async (estado) => {
      const [[{ c }]] = await pool.query(
        `SELECT COUNT(*) AS c
         FROM ordenes_compra oc
         JOIN requerimientos r ON r.id = oc.requerimiento_id
         WHERE oc.estado = ?${filtroSol}`,
        [estado, ...paramsSol]
      );
      return Number(c) || 0;
    };

    const contadores = {
      generada: await countEstado('generada'),
      distribuida: await countEstado('distribuida'),
      en_proceso: await countEstado('en_proceso'),
      recibida: await countEstado('recibida'),
      sin_po: 0,
    };

    {
      const [[{ c }]] = await pool.query(
        `SELECT COUNT(*) AS c
         FROM ordenes_compra oc
         JOIN requerimientos r ON r.id = oc.requerimiento_id
         WHERE oc.estado IN (${ESTADOS_OC_ACTIVAS.map(() => '?').join(',')})
           AND ${SQL_SIN_PO}${filtroSol}`,
        [...ESTADOS_OC_ACTIVAS, ...paramsSol]
      );
      contadores.sin_po = Number(c) || 0;
    }

    contadores.activas =
      contadores.generada
      + contadores.distribuida
      + contadores.en_proceso
      + contadores.recibida;

    let cola = colaRaw;
    if (!COLAS_OC[cola]) {
      if (contadores.sin_po > 0 && contadores.generada === 0) {
        // Si hay sin PO y no hay generadas nuevas, priorizar sin_po a veces;
        // aún así preferimos el flujo de estados en orden
      }
      if (contadores.generada > 0) cola = 'generada';
      else if (contadores.distribuida > 0) cola = 'distribuida';
      else if (contadores.en_proceso > 0) cola = 'en_proceso';
      else if (contadores.recibida > 0) cola = 'recibida';
      else if (contadores.sin_po > 0) cola = 'sin_po';
      else cola = 'generada';
    }

    const def = COLAS_OC[cola];
    const [items] = await pool.query(
      `SELECT
         oc.id, oc.numero_oc, oc.estado, oc.datatextnow_id, oc.fecha_po,
         oc.monto_total, oc.moneda, oc.created_at, oc.updated_at,
         DATEDIFF(NOW(), oc.created_at) AS dias_espera,
         r.consecutivo, r.tipo, r.solicitante_id,
         r.titulo_solicitud, r.area, r.departamento,
         sol.nombre AS solicitante_nombre,
         p.num_proveedor AS proveedor_num,
         p.nombre AS proveedor_nombre,
         CASE WHEN ${SQL_SIN_PO} THEN 1 ELSE 0 END AS sin_po
       FROM ordenes_compra oc
       JOIN requerimientos r ON r.id = oc.requerimiento_id
       LEFT JOIN usuarios sol ON sol.id = r.solicitante_id
       LEFT JOIN cotizaciones c ON c.id = oc.cotizacion_id
       LEFT JOIN proveedores p ON p.id = COALESCE(oc.proveedor_id, c.proveedor_id)
       WHERE ${def.where}${filtroSol}
       ORDER BY
         CASE WHEN ${SQL_SIN_PO} THEN 0 ELSE 1 END,
         oc.created_at ASC
       LIMIT ?`,
      [...paramsSol, limite]
    );

    return res.json({
      tipo: 'compras',
      cola,
      contadores,
      total: contadores.activas,
      items,
      link_todos: def.link,
      link_dashboard: 'dashboard.html#bandeja-oc',
    });
  } catch (err) {
    logger.error('[notificaciones.bandejaOc]', err);
    res.status(500).json({ mensaje: 'Error al cargar bandeja de OC' });
  }
}
