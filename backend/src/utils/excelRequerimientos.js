/**
 * Utilidades para importar y exportar requerimientos en formato Excel.
 * Compatible con el formato de "Requerimientos 2026.xlsx".
 *
 * Columnas del Excel:
 *  0  N° (consecutivo)
 *  1  Fecha de solicitud
 *  2  Proveedor
 *  3  Depto (área)
 *  4  Compañía  (ignorado)
 *  5  Tipo de servicio / Descripción  → titulo_solicitud + notas
 *  6  Usuario (solicitante)
 *  7  Status
 *  8  Orden de compra (número OC / DataTextNow ID)
 *  9  Fecha OC  (ignorado)
 * 10  Total
 * 11  Moneda
 * 12  Observación
 * 13  Entregado a Contabilidad
 * 14  Fecha de entrega a Contabilidad
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// ── Detección de tipo por consecutivo ────────────────────────────────────────
function detectarTipo(consecutivo) {
  const upper = String(consecutivo || '').toUpperCase();
  if (/\d{4}P-/.test(upper)) return 'PARTES';
  if (/\d{4}S-/.test(upper)) return 'SERVICIOS';
  return 'SERVICIOS';
}

// ── Detección de estado desde datos (sin color) ──────────────────────────────
function detectarEstado(row) {
  const ocNumero   = row[8] ? String(row[8]).trim() : '';
  const entregado  = row[13] ? String(row[13]).trim() : '';
  const statusText = String(row[7] || '').toUpperCase();

  if (ocNumero) return 'aprobado';

  if (statusText.includes('RECHAZ') ||
      statusText.includes('CANCEL') ||
      statusText.includes('NO APROBAD')) {
    return 'rechazado';
  }

  return 'borrador';
}

// ── Conversión fecha serial Excel → Date ─────────────────────────────────────
function excelDateToDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  if (typeof v === 'number') {
    return new Date(Math.round((v - 25569) * 86400 * 1000));
  }
  return null;
}

function excelDateToISO(v) {
  const d = excelDateToDate(v);
  return d ? d.toISOString().split('T')[0] : null;
}

// ── PARSE ─────────────────────────────────────────────────────────────────────
/**
 * Parsea un buffer de archivo .xlsx y retorna filas normalizadas.
 * Solo procesa hojas SERVICIOS y PARTES.
 * No detecta colores — usa los datos para determinar el estado.
 *
 * @param {Buffer} buffer
 * @returns {{ filas: FilaReq[], hojasSaltadas: string[] }}
 */
export function parseExcelRequerimientos(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const HOJAS_VALIDAS = new Set(['SERVICIOS', 'PARTES']);
  const hojasSaltadas = wb.SheetNames.filter(n => !HOJAS_VALIDAS.has(n));

  const filas = [];

  for (const sheetName of wb.SheetNames) {
    if (!HOJAS_VALIDAS.has(sheetName)) continue;

    const ws   = wb.Sheets[sheetName];
    if (!ws?.['!ref']) continue;

    const data  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const range = XLSX.utils.decode_range(ws['!ref']);

    for (let r = 1; r <= range.e.r; r++) {
      const row = data[r];
      if (!row || !row[0]) continue;

      // Filas sin datos reales (solo consecutivo pre-relleno)
      const tieneData = row[1] || row[2] || row[3] || row[5] || row[6];
      if (!tieneData) continue;

      const consecutivo = String(row[0]).trim();
      const ocNumero    = row[8] ? String(row[8]).trim() : '';
      const observacion = String(row[12] || '').trim();
      const descripcion = String(row[5]  || '').trim();
      const notasCombinadas = [descripcion, observacion].filter(Boolean).join(' | ');

      filas.push({
        consecutivo,
        tipo:           detectarTipo(consecutivo),
        fecha_sol:      excelDateToISO(row[1]),
        proveedor:      String(row[2] || '').trim(),
        area:           String(row[3] || '').trim() || null,
        titulo:         descripcion || consecutivo,
        notas:          notasCombinadas,
        usuario:        String(row[6] || '').trim(),
        oc_numero:      ocNumero,
        total:          row[10] !== '' ? parseFloat(row[10]) || null : null,
        moneda:         String(row[11] || 'MXN').trim() || 'MXN',
        entregado:      String(row[13] || '').trim(),
        estado:         detectarEstado(row),
      });
    }
  }

  return { filas, hojasSaltadas };
}

// ── COLORES PARA EXPORT ───────────────────────────────────────────────────────
const FILL_ROSA    = { fgColor: { rgb: 'E59EDD' } }; // aprobado + OC cerrada
const FILL_VERDE   = { fgColor: { rgb: 'B4E5A2' } }; // aprobado + OC activa
const FILL_AMARILLO= { fgColor: { rgb: 'FFFF00' } }; // rechazado
const FILL_NONE    = {};

function fillPorEstado(req) {
  if (req.estado === 'rechazado') return FILL_AMARILLO;
  if (req.estado !== 'aprobado')  return FILL_NONE;
  if (req.oc_estado === 'cerrada' || req.oc_estado === 'recibida') return FILL_ROSA;
  if (req.oc_estado)              return FILL_VERDE;
  return FILL_NONE;
}

function cellStyle(fill) {
  if (!fill.fgColor) return {};
  return { fill: { patternType: 'solid', fgColor: fill.fgColor } };
}

const HEADER_STYLE = {
  font:      { bold: true, color: { rgb: 'FFFFFF' } },
  fill:      { patternType: 'solid', fgColor: { rgb: '1E3A5F' } },
  alignment: { horizontal: 'center' },
};

// ── GENERATE ─────────────────────────────────────────────────────────────────
/**
 * Genera un buffer XLSX con todos los requerimientos proporcionados.
 * Agrupa por tipo en distintas hojas (SERVICIOS, PARTES).
 * Aplica colores de fila según el estado.
 *
 * @param {object[]} reqs — registros de la BD (con oc_estado, solicitante_nombre, etc.)
 * @returns {Buffer}
 */
export function generarExcelRequerimientos(reqs) {
  const wb = XLSX.utils.book_new();

  const TIPOS = ['SERVICIOS', 'PARTES'];
  const HEADERS = [
    'N°', 'Fecha de solicitud', 'Proveedor', 'Depto', 'Compañía',
    'Tipo de servicio / Descripción', 'Usuario', 'Status',
    'Orden de compra', 'Fecha OC', 'Total', 'Moneda',
    'Observación', 'Entregado a Contabilidad', 'Fecha de entrega',
  ];

  const formatDate = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const statusText = (req) => {
    if (req.estado === 'rechazado')  return 'RECHAZADO';
    if (req.estado === 'borrador')   return 'BORRADOR';
    if (req.estado === 'en_revision') return 'EN REVISIÓN';
    if (req.estado === 'incompleto') return 'INCOMPLETO';
    if (req.oc_estado === 'cerrada' || req.oc_estado === 'recibida') return 'ENTREGADO';
    if (req.oc_estado)               return 'EN PROCESO';
    return 'APROBADO';
  };

  for (const tipo of TIPOS) {
    const reqs_tipo = reqs.filter(r => (r.tipo || 'SERVICIOS') === tipo);
    if (!reqs_tipo.length) continue;

    const wsData = [];
    const wsStyles = [];

    // Fila de encabezado
    wsData.push(HEADERS);
    wsStyles.push(HEADERS.map(() => HEADER_STYLE));

    for (const req of reqs_tipo) {
      const fill   = fillPorEstado(req);
      const style  = cellStyle(fill);

      const rowData = [
        req.consecutivo,
        formatDate(req.created_at),
        req.proveedor_nombre || '',
        req.area          || '',
        '31',
        req.titulo_solicitud || req.notas || '',
        req.solicitante_nombre || '',
        statusText(req),
        req.oc_datatextnow_id || req.oc_numero || '',
        req.oc_estado ? formatDate(req.oc_fecha_autorizacion) : '',
        req.oc_monto_total ? Number(req.oc_monto_total) : '',
        req.oc_moneda || (req.oc_monto_total ? 'MXN' : ''),
        req.notas || '',
        (req.oc_estado === 'cerrada' || req.oc_estado === 'recibida') ? 'OK' : '',
        (req.oc_estado === 'cerrada' || req.oc_estado === 'recibida') ? formatDate(req.updated_at) : '',
      ];

      wsData.push(rowData);
      wsStyles.push(rowData.map(() => style));
    }

    // Crear hoja con estilos
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Aplicar estilos celda a celda
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = wsStyles[R]?.[C] || {};
      }
    }

    // Anchos de columna
    ws['!cols'] = [
      { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 8 },
      { wch: 40 }, { wch: 20 }, { wch: 20 },
      { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 7 },
      { wch: 30 }, { wch: 22 }, { wch: 18 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, tipo);
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
}
