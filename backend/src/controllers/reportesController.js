import * as Ordenes from '../models/ordenes.js';
import { autorizar } from '../middlewares/authMiddleware.js';
import XLSX from 'xlsx';

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
