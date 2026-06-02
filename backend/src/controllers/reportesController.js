import * as Ordenes from '../models/ordenes.js';
import { autorizar } from '../middlewares/authMiddleware.js';
import XLSX from 'xlsx';
import pool from '../config/db.js';

/**
 * Genera el "Reporte de Órdenes de Compra" (estilo POS HILOS básico)
 * Solo accesible por contabilidad y admin.
 * Soporta filtros: anual, mensual, semanal.
 */
export async function generarReporteOrdenesCompra(req, res) {
  try {
    const { tipo = 'anual', anio, mes, semana } = req.query;

    // Construir filtros de fecha basados en fecha_autorizacion
    const filtros = {};
    const now = new Date();

    const year = parseInt(anio) || now.getFullYear();

    if (tipo === 'anual') {
      filtros.fecha_desde = `${year}-01-01`;
      filtros.fecha_hasta = `${year}-12-31`;
    } else if (tipo === 'mensual') {
      const month = parseInt(mes) || (now.getMonth() + 1);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      filtros.fecha_desde = start.toISOString().split('T')[0];
      filtros.fecha_hasta = end.toISOString().split('T')[0];
    } else if (tipo === 'semanal') {
      const week = parseInt(semana) || 1;
      // Aproximación simple de semana (ISO week no es trivial, usamos rango aproximado)
      const start = new Date(year, 0, 1 + (week - 1) * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      filtros.fecha_desde = start.toISOString().split('T')[0];
      filtros.fecha_hasta = end.toISOString().split('T')[0];
    }

    // Obtener datos (usamos el modelo existente + filtros de fecha si aplica)
    const { datos: ocs } = await Ordenes.listar({
      ...filtros,
      limite: 5000 // Suficiente para un reporte
    });

    // Construir filas para el reporte (columnas inspiradas en POS HILOS básico)
    const rows = ocs.map(oc => ({
      'Número OC': oc.numero_oc,
      'Fecha OC': oc.created_at ? new Date(oc.created_at).toISOString().split('T')[0] : '',
      'Consecutivo Req': oc.consecutivo || '',
      'Tipo': oc.tipo || '',
      'Proveedor': oc.proveedor_nombre || '',
      'Estado OC': oc.estado,
      'Fecha Autorización': oc.fecha_autorizacion ? new Date(oc.fecha_autorizacion).toISOString().split('T')[0] : '',
      'Costo Total': oc.monto_total || 0,
      'PO DataTextNow': oc.datatextnow_id || '',
      'Estado Recepción': oc.estado_recepcion || '',
      'Fecha Recepción': oc.fecha_recepcion ? new Date(oc.fecha_recepcion).toISOString().split('T')[0] : '',
    }));

    // Crear workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Ajustar anchos de columna aproximados
    const colWidths = [
      { wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 12 },
      { wch: 35 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
      { wch: 18 }, { wch: 18 }, { wch: 14 }
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Reporte OC');

    // Nombre del archivo
    const filename = `Reporte_Ordenes_Compra_${tipo}_${year}${mes ? '_' + mes : ''}${semana ? '_sem' + semana : ''}.xlsx`;

    // Enviar como descarga
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (err) {
    console.error('[Reporte OC]', err);
    res.status(500).json({ mensaje: 'Error al generar el reporte' });
  }
}

/**
 * Genera el reporte "STATUS 2025 POS HILOS" estilo consolidado por línea/item.
 * Combina datos internos (Requerimientos + items de Catálogo + OC + Recepciones)
 * con la estructura de los reportes com_data_now.
 * 
 * Columnas principales inspiradas en el Excel STATUS 2025.
 */
export async function generarReporteStatusPOS(req, res) {
  try {
    const { anio, po, estado } = req.query;

    // Query principal: explotamos OC + Requerimiento + Items del catálogo + Recepción
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
        r.requiere_cotizacion,
        u.nombre as requisitor,
        ri.cantidad as cantidad_solicitada,
        c.codigo as numero_de_parte,
        c.descripcion,
        p.nombre as proveedor,
        rec.estado as estado_recepcion,
        rec.fecha_recepcion,
        rec.datatextnow_id as recibo_number,
        rec.notas as rec_notas,
        c.costo_referencia as costo_unitario,
        cot.iva as cot_iva,
        cot.monto_total as cot_monto_total
      FROM ordenes_compra oc
      JOIN requerimientos r ON r.id = oc.requerimiento_id
      JOIN requerimiento_items ri ON ri.requerimiento_id = r.id
      JOIN catalogo c ON c.id = ri.catalogo_id
      LEFT JOIN usuarios u ON u.id = r.solicitante_id
      LEFT JOIN proveedores p ON p.id = c.proveedor_id
      LEFT JOIN recepciones rec ON rec.orden_compra_id = oc.id
      LEFT JOIN cotizaciones cot ON cot.id = oc.cotizacion_id
      WHERE 1=1
    `;
    const params = [];

    if (anio) {
      sql += ` AND YEAR(oc.fecha_autorizacion) = ? `;
      params.push(parseInt(anio));
    }
    if (po) {
      sql += ` AND (oc.datatextnow_id LIKE ? OR oc.numero_oc LIKE ?) `;
      params.push(`%${po}%`, `%${po}%`);
    }
    if (estado) {
      sql += ` AND oc.estado = ? `;
      params.push(estado);
    }

    sql += ` ORDER BY oc.datatextnow_id, ri.id `;

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
        'Fecha de P.O.': row.fecha_po ? new Date(row.fecha_po).toISOString().split('T')[0] : '',
        'wk': '', // no data
        'Año': row.fecha_po ? new Date(row.fecha_po).getFullYear() : '',
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
        'Comments': row.notas || row.req_consecutivo || '',
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

    const filename = `STATUS_2025_POS_HILOS_${new Date().toISOString().slice(0,10)}.xlsx`;

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (err) {
    console.error('[Reporte STATUS POS HILOS]', err);
    res.status(500).json({ mensaje: 'Error al generar el reporte STATUS' });
  }
}
