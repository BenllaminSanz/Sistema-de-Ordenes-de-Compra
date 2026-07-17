import * as Ordenes from '../models/ordenes.js';
import XLSX from 'xlsx';
import pool from '../config/db.js';
import logger from '../utils/logger.js';

/**
 * Carga ítems de cada OC (cotización / catálogo / libres) y agrega
 * cantidades recibidas + números de recibo por item_key.
 * @returns {Map<number, Array>}
 */
async function cargarItemsYRecibosPorOc(ocIds) {
  const result = new Map();
  if (!ocIds?.length) return result;

  // Metadatos mínimos: cotizacion_id / requerimiento_id por OC
  const [ocsMeta] = await pool.query(
    `SELECT id, cotizacion_id, requerimiento_id FROM ordenes_compra WHERE id IN (?)`,
    [ocIds]
  );
  const metaById = new Map(ocsMeta.map((r) => [r.id, r]));

  // Recepción por ítem (múltiples entregas → sumar qty y unir recibos)
  const [recRows] = await pool.query(
    `SELECT r.orden_compra_id, ri.item_key,
            SUM(ri.cantidad_recibida) AS cantidad_recibida,
            GROUP_CONCAT(
              DISTINCT NULLIF(TRIM(ri.numero_recibo), '')
              ORDER BY ri.id SEPARATOR ', '
            ) AS numeros_recibo
     FROM recepciones r
     JOIN recepcion_items ri ON ri.recepcion_id = r.id
     WHERE r.orden_compra_id IN (?)
     GROUP BY r.orden_compra_id, ri.item_key`,
    [ocIds]
  );
  const reciboMap = new Map(); // `${ocId}|${item_key}` → { cantidad_recibida, numeros_recibo }
  for (const row of recRows) {
    reciboMap.set(`${row.orden_compra_id}|${row.item_key}`, {
      cantidad_recibida: parseFloat(row.cantidad_recibida) || 0,
      numeros_recibo: row.numeros_recibo || '',
    });
  }

  const cotIds = [...new Set(ocsMeta.map((o) => o.cotizacion_id).filter(Boolean))];
  const reqIdsSinCot = [
    ...new Set(
      ocsMeta.filter((o) => !o.cotizacion_id).map((o) => o.requerimiento_id).filter(Boolean)
    ),
  ];

  // Ítems desde cotización
  const cotItemsByCot = new Map();
  if (cotIds.length) {
    const [cotItems] = await pool.query(
      `SELECT ci.id, ci.cotizacion_id, ci.descripcion, ci.cantidad, ci.unidad,
              ci.precio_unitario,
              COALESCE(NULLIF(TRIM(ci.codigo_catalogo), ''), c.codigo) AS codigo
       FROM cotizacion_items ci
       LEFT JOIN catalogo c ON c.id = ci.catalogo_id
       WHERE ci.cotizacion_id IN (?)
       ORDER BY ci.id ASC`,
      [cotIds]
    );
    for (const it of cotItems) {
      if (!cotItemsByCot.has(it.cotizacion_id)) cotItemsByCot.set(it.cotizacion_id, []);
      cotItemsByCot.get(it.cotizacion_id).push({
        item_key: `cot-${it.id}`,
        codigo: it.codigo || null,
        descripcion: it.descripcion || '',
        unidad: it.unidad || '',
        cantidad: parseFloat(it.cantidad) || 0,
        precio_unitario: it.precio_unitario != null ? parseFloat(it.precio_unitario) : null,
      });
    }
  }

  // Ítems catálogo del REQ (sin cotización)
  const catItemsByReq = new Map();
  const libItemsByReq = new Map();
  if (reqIdsSinCot.length) {
    const [catItems] = await pool.query(
      `SELECT ri.id, ri.requerimiento_id, ri.cantidad,
              c.codigo, c.descripcion, c.unidad,
              c.costo_referencia AS precio_unitario
       FROM requerimiento_items ri
       JOIN catalogo c ON c.id = ri.catalogo_id
       WHERE ri.requerimiento_id IN (?)
       ORDER BY ri.id ASC`,
      [reqIdsSinCot]
    );
    for (const it of catItems) {
      if (!catItemsByReq.has(it.requerimiento_id)) catItemsByReq.set(it.requerimiento_id, []);
      catItemsByReq.get(it.requerimiento_id).push({
        item_key: `cat-${it.id}`,
        codigo: it.codigo || null,
        descripcion: it.descripcion || '',
        unidad: it.unidad || '',
        cantidad: parseFloat(it.cantidad) || 0,
        precio_unitario: it.precio_unitario != null ? parseFloat(it.precio_unitario) : null,
      });
    }

    const [libItems] = await pool.query(
      `SELECT id, requerimiento_id, descripcion, cantidad, unidad
       FROM requerimiento_items_libres
       WHERE requerimiento_id IN (?)
       ORDER BY id ASC`,
      [reqIdsSinCot]
    );
    for (const it of libItems) {
      if (!libItemsByReq.has(it.requerimiento_id)) libItemsByReq.set(it.requerimiento_id, []);
      libItemsByReq.get(it.requerimiento_id).push({
        item_key: `lib-${it.id}`,
        codigo: null,
        descripcion: it.descripcion || '',
        unidad: it.unidad || '',
        cantidad: parseFloat(it.cantidad) || 0,
        precio_unitario: null,
      });
    }
  }

  for (const ocId of ocIds) {
    const meta = metaById.get(ocId);
    if (!meta) {
      result.set(ocId, []);
      continue;
    }

    let items = [];
    if (meta.cotizacion_id) {
      items = cotItemsByCot.get(meta.cotizacion_id) || [];
    } else {
      const cat = catItemsByReq.get(meta.requerimiento_id) || [];
      items = cat.length ? cat : (libItemsByReq.get(meta.requerimiento_id) || []);
    }

    result.set(
      ocId,
      items.map((it) => {
        const rec = reciboMap.get(`${ocId}|${it.item_key}`) || {};
        return {
          ...it,
          cantidad_recibida: rec.cantidad_recibida || 0,
          numeros_recibo: rec.numeros_recibo || '',
        };
      })
    );
  }

  return result;
}

/**
 * Genera el "Reporte de Órdenes de Compra".
 * - Con periodo (anual/mensual/semanal): filtros por fecha
 * - Con libre=1: exporta según filtros de listado (estado, tipo_req, busqueda, sin_po)
 * - Una fila por ítem de la OC; incluye No. de recibo de recepciones
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

    const { datos: ocs } = await Ordenes.listar({
      ...filtros,
      limite: 5000,
    });

    const fmtFecha = (v) => {
      if (!v) return '';
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
      try { return new Date(v).toISOString().split('T')[0]; } catch { return ''; }
    };

    // Desglose por ítem + No. de recibo por línea de recepción
    const ocIds = ocs.map((o) => o.id).filter(Boolean);
    const itemsPorOc = await cargarItemsYRecibosPorOc(ocIds);

    const rows = [];
    for (const oc of ocs) {
      const base = {
        'No. OC': oc.numero_oc,
        'Fecha creación': fmtFecha(oc.created_at),
        'Últ. modificación': fmtFecha(oc.updated_at),
        'Consecutivo REQ': oc.consecutivo || '',
        'Tipo': oc.tipo || '',
        'Solicitante': oc.solicitante_nombre || '',
        'Proveedor': oc.proveedor_num
          ? `${oc.proveedor_num} — ${oc.proveedor_nombre || ''}`
          : (oc.proveedor_nombre || ''),
        'Estado OC': oc.estado,
        'Fecha Autorización': fmtFecha(oc.fecha_autorizacion),
        'PO DataTextNow': oc.datatextnow_id || '',
        'Fecha PO': fmtFecha(oc.fecha_po),
        'Monto Total OC': oc.monto_total != null ? Number(oc.monto_total) : '',
        'Moneda': oc.moneda || 'MXN',
        'Estado Recepción': oc.estado_recepcion || '',
        'Fecha Recepción': fmtFecha(oc.fecha_recepcion),
        'Notas contabilidad': oc.notas || '',
      };

      const items = itemsPorOc.get(oc.id) || [];
      if (!items.length) {
        rows.push({
          ...base,
          'Línea': '',
          'Código ítem': '',
          'Descripción ítem': '',
          'Unidad': '',
          'Cantidad solicitada': '',
          'Precio unitario': '',
          'Importe línea': '',
          'Cantidad recibida': '',
          'No. de recibo': '',
        });
        continue;
      }

      items.forEach((it, idx) => {
        const cant = it.cantidad != null ? Number(it.cantidad) : '';
        const precio = it.precio_unitario != null ? Number(it.precio_unitario) : '';
        const importe = (cant !== '' && precio !== '' && Number.isFinite(cant) && Number.isFinite(precio))
          ? Math.round(cant * precio * 100) / 100
          : '';
        rows.push({
          ...base,
          'Línea': (idx + 1) * 10,
          'Código ítem': it.codigo || '',
          'Descripción ítem': it.descripcion || '',
          'Unidad': it.unidad || '',
          'Cantidad solicitada': cant,
          'Precio unitario': precio,
          'Importe línea': importe,
          'Cantidad recibida': it.cantidad_recibida != null ? Number(it.cantidad_recibida) : 0,
          'No. de recibo': it.numeros_recibo || '',
        });
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
      { wch: 20 }, { wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 28 },
      { wch: 6 }, { wch: 14 }, { wch: 40 }, { wch: 8 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Ordenes de Compra');

    const filename = exportLibre
      ? `Ordenes_Compra_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `Reporte_Ordenes_Compra_${periodoEfectivo}_${year}${mes ? '_' + mes : ''}${semana ? '_sem' + semana : ''}.xlsx`;

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    logger.error('[Reporte OC]', err);
    res.status(500).json({ mensaje: 'Error al generar el reporte' });
  }
}

export async function generarReporteStatusPOS(req, res) {
  try {
    const { anio, po, estado } = req.query;
    const year = parseInt(anio) || new Date().getFullYear();

    // Query principal: OC + Requerimiento + Items (catálogo o libres) + Recepción
    // LEFT JOINs en items/catálogo para incluir OCs de reqs con items_libres o solo notas.
    // COALESCE en fecha para incluir OCs sin fecha_autorizacion aún (generada/en_proceso).
    let sql = `
      SELECT
        oc.id as oc_id,
        oc.numero_oc,
        oc.datatextnow_id as po_number,
        oc.fecha_autorizacion as fecha_po,
        oc.estado as estado_oc,
        oc.notas as oc_notas,
        r.id as req_id,
        r.consecutivo as req_consecutivo,
        r.tipo,
        r.notas,
        r.titulo_solicitud,
        r.requiere_cotizacion,
        u.nombre as requisitor,
        COALESCE(ri.cantidad, ril.cantidad, 1) as cantidad_solicitada,
        COALESCE(c.codigo, ril.descripcion, '—') as numero_de_parte,
        COALESCE(c.descripcion, ril.descripcion, r.titulo_solicitud) as descripcion,
        COALESCE(p.nombre, prov_oc.nombre) as proveedor,
        rec.estado as estado_recepcion,
        rec.fecha_recepcion,
        rec.datatextnow_id as recibo_number,
        rec.notas as rec_notas,
        COALESCE(c.costo_referencia, 0) as costo_unitario,
        cot.iva as cot_iva,
        cot.monto_total as cot_monto_total
      FROM ordenes_compra oc
      JOIN requerimientos r ON r.id = oc.requerimiento_id
      LEFT JOIN requerimiento_items ri ON ri.requerimiento_id = r.id
      LEFT JOIN catalogo c ON c.id = ri.catalogo_id
      LEFT JOIN proveedores p ON p.id = c.proveedor_id
      LEFT JOIN requerimiento_items_libres ril ON ril.requerimiento_id = r.id AND ri.id IS NULL
      LEFT JOIN usuarios u ON u.id = r.solicitante_id
      LEFT JOIN proveedores prov_oc ON prov_oc.id = oc.proveedor_id
      LEFT JOIN recepciones rec ON rec.orden_compra_id = oc.id
      LEFT JOIN cotizaciones cot ON cot.id = oc.cotizacion_id
      WHERE 1=1
    `;
    const params = [];

    sql += ` AND YEAR(COALESCE(oc.fecha_autorizacion, oc.created_at)) = ? `;
    params.push(year);
    if (po) {
      sql += ` AND (oc.datatextnow_id LIKE ? OR oc.numero_oc LIKE ?) `;
      params.push(`%${po}%`, `%${po}%`);
    }
    if (estado) {
      sql += ` AND oc.estado = ? `;
      params.push(estado);
    }

    sql += ` ORDER BY oc.numero_oc, ri.id, ril.id `;

    const [rows] = await pool.query(sql, params);

    // Build rows in the format of the STATUS sheet
    const reportRows = rows.map((row, idx) => {
      const poLine = row.po_number ? `${row.po_number}/${(idx % 5 + 1) * 10}` : row.numero_oc; // formato aproximado PO/Line
      const linea = ((idx % 5) + 1) * 10;

      const cantidadSolicitada = parseFloat(row.cantidad_solicitada) || 0;
      const costoUnit = parseFloat(row.costo_unitario) || 0;
      const costoTotal = cantidadSolicitada * costoUnit;

      // Use cotizacion data if available for totals/iva
      const ivaMonto = parseFloat(row.cot_iva) || (costoTotal * 0.16);
      const flete = 0; // placeholder - pendiente datos de flete
      const totalConIVA = costoTotal + ivaMonto + flete;

      // Derivar STATUS a partir de OC + Recepción + notas (para coincidir con Excel)
      let status = 'PENDIENTE';
      const ocNotasUpper = (row.oc_notas || '').toUpperCase();
      const recNotasUpper = (row.rec_notas || '').toUpperCase();

      if (row.estado_oc === 'cancelada' || recNotasUpper.includes('CANCELADO') || ocNotasUpper.includes('CANCELADO')) {
        if (ocNotasUpper.includes('DESABASTO') || recNotasUpper.includes('DESABASTO')) {
          status = 'CANCELADO POR DESABASTO';
        } else if (ocNotasUpper.includes('PRECIO') || recNotasUpper.includes('PRECIO')) {
          status = 'CANCELADO POR CAMBIO DE PRECIO';
        } else {
          status = 'CANCELADO';
        }
      } else if (row.estado_recepcion === 'entregado_solicitante' || row.estado_oc === 'cerrada') {
        status = 'RECIBIDO';
      } else if (row.estado_recepcion === 'recibido_parcial') {
        status = 'RECIBIDO PARCIAL';
      } else if (row.estado_oc === 'en_proceso' || row.estado_oc === 'distribuida') {
        status = 'EN PROCESO';
      } else if (row.estado_oc === 'generada') {
        status = 'PENDIENTE';
      }

      return {
        'PO Line': poLine,
        'PO': row.po_number || row.numero_oc,
        'Fecha de P.O.': row.fecha_po ? new Date(row.fecha_po).toISOString().split('T')[0] : '(sin autorizar)',
        'wk': '', // no data
        'Año': row.fecha_po ? new Date(row.fecha_po).getFullYear() : year,
        'N° Vendor': '', // no direct data
        'Proveedor': row.proveedor || '',
        'Centro ': '', 
        'Requisitor': row.requisitor || '',
        'Factura': 'PENDIENTE',
        'Fecha de factura': '',
        'Transporte': 'PENDIENTE',
        'Guia Corta': 'PENDIENTE',
        'Numero de guía': 'PENDIENTE',
        'línea': linea,
        'Numero de Parte': row.numero_de_parte,
        'DESCRIPCION': row.descripcion,
        'Comments': row.titulo_solicitud || row.notas || row.req_consecutivo || '',
        'Cantidad Solicitada': cantidadSolicitada,
        'Cantidad Recibida': row.estado_recepcion ? cantidadSolicitada : 0, // aproximado; mejorar con recepción por ítem
        'BO': 0,
        'Costo unitario': costoUnit,
        'Costo total por linea': costoTotal,
        'FLETE / tariff': flete,
        'IVA': ivaMonto,
        'Total con IVA': totalConIVA,
        'Moneda': 'MXN',
        'BUSQUEDA': '',
        'STATUS': status,
        'REFERENCIA': row.req_consecutivo || '',
        'Numero de Recibo ': row.recibo_number || '',
        'FECHA DE RECEPCIÓN': row.fecha_recepcion ? new Date(row.fecha_recepcion).toISOString().split('T')[0] : '',
        'VOLUCKOP': '',
        'CC': '',
      };
    });

    // Create Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(reportRows);

    // Basic column widths
    ws['!cols'] = [
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 4 }, { wch: 6 },
      { wch: 10 }, { wch: 40 }, { wch: 10 }, { wch: 22 }, { wch: 12 },
      { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 6 },
      { wch: 14 }, { wch: 45 }, { wch: 35 }, { wch: 12 }, { wch: 12 },
      { wch: 5 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 12 },
      { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 12 },
      { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 6 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'STATUS POS HILOS');

    const filename = `STATUS_${year}_POS_HILOS_${new Date().toISOString().slice(0,10)}.xlsx`;

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (err) {
    logger.error('[Reporte STATUS POS HILOS]', err);
    res.status(500).json({ mensaje: 'Error al generar el reporte STATUS' });
  }
}
