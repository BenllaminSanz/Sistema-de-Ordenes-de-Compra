/**
 * Utilidades para importar y exportar requerimientos en formato Excel.
 *
 * Formato LEGACY (hojas SERVICIOS / PARTES):
 *  0  N°  1 Fecha sol  2 Proveedor  3 Depto  4 Compañía
 *  5 Descripción  6 Usuario  7 Status  8 OC  9 Fecha OC
 * 10 Total 11 Moneda 12 Observación 13 Entregado 14 Fecha entrega
 *
 * Formato BASE GRAL (Hoja1 u hoja única — layout Contabilidad 2026):
 *  0 Orden de compra (PO DTN)
 *  1 Fecha (fecha PO)
 *  2 N° (consecutivo; puede llevar sufijo A/B/C si un REQ se parte en varias OC)
 *  3 Fecha de solicitud
 *  4 Tipo
 *  5 Proveedor
 *  6 Total
 *  7 Moneda
 *  8 Usuario
 *  9 Estado (flujo: Distribuida, Cerrada, Aprobado, En revisión, Cancelada…)
 * 10 Depto
 * 11 Compañía
 * 12 Tipo de servicio / descripción
 * 13 Usuario (duplicada, ignorada si vacía)
 * 14 Status (bitácora / notas libres)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectarTipo(consecutivo, tipoExcel) {
  const t = String(tipoExcel || '').trim().toUpperCase();
  if (t === 'PARTES' || t === 'SERVICIOS' || t === 'FLETES') return t;
  const upper = String(consecutivo || '').toUpperCase();
  if (/\d{4}P-/.test(upper)) return 'PARTES';
  if (/\d{4}S-/.test(upper)) return 'SERVICIOS';
  if (/\d{4}F-/.test(upper)) return 'FLETES';
  return 'SERVICIOS';
}

function excelDateToDate(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    // dd/mm/yyyy o dd-mm-yyyy
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      const d = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      let y = parseInt(m[3], 10);
      if (y < 100) y += 2000;
      const dt = new Date(y, mo, d);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'number') {
    // Serial Excel → UTC date
    return new Date(Math.round((v - 25569) * 86400 * 1000));
  }
  return null;
}

function excelDateToISO(v) {
  const d = excelDateToDate(v);
  if (!d) return null;
  // Usar componentes UTC del serial Excel o locales si vino de string parseado local
  if (typeof v === 'number') {
    return d.toISOString().split('T')[0];
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normHeader(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Normaliza PO DTN del Excel.
 * '-' o vacío → sin PO; N/A → 'NA' (regla del sistema).
 */
export function normalizarPoExcel(raw) {
  if (raw == null || raw === '') return { po: null, esNa: false, sinPo: true };
  const s = String(raw).trim();
  if (!s || s === '-') return { po: null, esNa: false, sinPo: true };
  if (/^n\/?a$/i.test(s)) return { po: 'NA', esNa: true, sinPo: false };
  return { po: s, esNa: false, sinPo: false };
}

/**
 * Mapea columna Estado del Excel → estado REQ + si crea OC y en qué estado.
 * Cancelada → rechazado (acordado “por ahora”).
 */
export function mapearEstadoExcel(estadoRaw) {
  const e = String(estadoRaw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!e) {
    return { reqEstado: 'borrador', crearOc: false, ocEstado: null };
  }
  if (e.includes('cancel')) {
    // Si hay OC en BD se sincroniza a cancelada; si no, solo REQ rechazado
    return { reqEstado: 'rechazado', crearOc: false, ocEstado: 'cancelada', motivo: 'cancelada' };
  }
  if (e.includes('revision') || e.includes('revisión')) {
    return { reqEstado: 'en_revision', crearOc: false, ocEstado: null };
  }
  if (e === 'aprobado' || e === 'aprobada') {
    return { reqEstado: 'aprobado', crearOc: false, ocEstado: null };
  }
  if (e.includes('distribuid')) {
    return { reqEstado: 'cerrado', crearOc: true, ocEstado: 'distribuida' };
  }
  // Parcial (entrega/avance incompleto) → OC en_proceso
  if (e.includes('parcial')) {
    return { reqEstado: 'cerrado', crearOc: true, ocEstado: 'en_proceso' };
  }
  if (e.includes('cerrad')) {
    return { reqEstado: 'cerrado', crearOc: true, ocEstado: 'cerrada' };
  }
  if (e.includes('proceso')) {
    return { reqEstado: 'cerrado', crearOc: true, ocEstado: 'en_proceso' };
  }
  if (e.includes('recibid')) {
    return { reqEstado: 'cerrado', crearOc: true, ocEstado: 'recibida' };
  }
  if (e.includes('generad')) {
    return { reqEstado: 'cerrado', crearOc: true, ocEstado: 'generada' };
  }
  // Fallback: guardar como borrador y dejar nota
  return { reqEstado: 'borrador', crearOc: false, ocEstado: null, desconecido: true };
}

/**
 * Extrae posible código de catálogo al inicio de la descripción (ej. "10603737 3 Pzas").
 * Solo acepta tokens con al menos un dígito (evita "Reparación", "Tiras", "Compra"…).
 */
export function extraerCodigoDesdeDescripcion(desc) {
  const s = String(desc || '').trim();
  if (!s) return null;
  const m = s.match(/^([A-Za-z0-9][A-Za-z0-9._\-\/]{1,})\b/);
  if (!m) return null;
  const code = m[1];
  // Debe parecer número de parte: contiene dígito y no es solo cantidad 1–2 dígitos
  if (!/\d/.test(code)) return null;
  if (/^\d{1,2}$/.test(code)) return null;
  if (/^(pza|pzas|ea|kg|lt)$/i.test(code)) return null;
  return code;
}

/**
 * Detecta si el encabezado es el layout BASE GRAL (PO / Fecha / N° …).
 */
function esLayoutBaseGral(headerRow) {
  if (!headerRow || !headerRow.length) return false;
  const h0 = normHeader(headerRow[0]);
  const h1 = normHeader(headerRow[1]);
  const h2 = normHeader(headerRow[2]);
  const h9 = normHeader(headerRow[9]);
  const tienePo = h0.includes('orden de compra') || h0 === 'oc' || h0.includes('po');
  const tieneFecha = h1 === 'fecha' || h1.includes('fecha po') || h1.includes('fecha de po');
  const tieneN = h2 === 'n' || h2.startsWith('n ') || h2.includes('n°') || h2.includes('no.') || h2 === 'nº' || h2.includes('consecutivo');
  // También: col0 orden compra y col2 con patrón de consecutivo en datos
  return (tienePo && (tieneFecha || tieneN)) || (tienePo && h9.includes('estado'));
}

function esLayoutLegacyHeader(headerRow) {
  if (!headerRow || !headerRow.length) return false;
  const h0 = normHeader(headerRow[0]);
  return h0 === 'n' || h0.startsWith('n ') || h0.includes('n°') || h0.includes('consecutivo') || h0 === 'no';
}

// ── Parse LEGACY ──────────────────────────────────────────────────────────────

function detectarEstadoLegacy(row) {
  const ocNumero = row[8] ? String(row[8]).trim() : '';
  const statusText = String(row[7] || '').toUpperCase();

  if (ocNumero) return 'aprobado';

  if (
    statusText.includes('RECHAZ') ||
    statusText.includes('CANCEL') ||
    statusText.includes('NO APROBAD')
  ) {
    return 'rechazado';
  }

  return 'borrador';
}

function parseHojaLegacy(data, filas, meta) {
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row || !row[0]) continue;
    const tieneData = row[1] || row[2] || row[3] || row[5] || row[6];
    if (!tieneData) continue;

    const consecutivo = String(row[0]).trim();
    const ocNumero = row[8] ? String(row[8]).trim() : '';
    const observacion = String(row[12] || '').trim();
    const descripcion = String(row[5] || '').trim();
    const statusTxt = String(row[7] || '').trim();
    const notasCombinadas = [descripcion, observacion, statusTxt].filter(Boolean).join(' | ');
    const poInfo = normalizarPoExcel(ocNumero);
    const reqEstado = detectarEstadoLegacy(row);
    const mapEst =
      reqEstado === 'rechazado'
        ? { reqEstado: 'rechazado', crearOc: false, ocEstado: null }
        : poInfo.po || poInfo.esNa
          ? { reqEstado: 'cerrado', crearOc: true, ocEstado: 'distribuida' }
          : { reqEstado, crearOc: false, ocEstado: null };

    filas.push({
      filaExcel: r + 1,
      layout: 'legacy',
      consecutivo,
      tipo: detectarTipo(consecutivo),
      fecha_sol: excelDateToISO(row[1]),
      fecha_po: excelDateToISO(row[9]),
      proveedor: String(row[2] || '').trim(),
      area: String(row[3] || '').trim() || null,
      departamento: null,
      titulo: descripcion || consecutivo,
      descripcion,
      notas: notasCombinadas,
      status_texto: statusTxt,
      usuario: String(row[6] || '').trim(),
      oc_numero: poInfo.po,
      po_na: poInfo.esNa,
      sin_po: poInfo.sinPo,
      total: row[10] !== '' && row[10] != null ? parseFloat(row[10]) || null : null,
      moneda: String(row[11] || 'MXN').trim() || 'MXN',
      estado_excel: statusTxt,
      ...mapEst,
    });
    meta.legacy += 1;
  }
}

// ── Parse BASE GRAL ───────────────────────────────────────────────────────────

function parseHojaBaseGral(data, filas, meta) {
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;

    const consecutivo = row[2] != null && row[2] !== '' ? String(row[2]).trim() : '';
    const ocRaw = row[0];
    const descripcion = String(row[12] || '').trim();
    const proveedor = String(row[5] || '').trim();
    const usuario = String(row[8] || '').trim() || String(row[13] || '').trim();
    const estadoExcel = String(row[9] || '').trim();
    const statusTxt = String(row[14] || '').trim();
    const tipoExcel = String(row[4] || '').trim();
    const depto = String(row[10] || '').trim();

    if (!consecutivo && !descripcion && !proveedor && (ocRaw === '' || ocRaw == null)) {
      continue;
    }
    if (!consecutivo) {
      meta.sinConsecutivo.push({ fila: r + 1, oc: ocRaw, desc: descripcion.slice(0, 40) });
      continue;
    }

    const poInfo = normalizarPoExcel(ocRaw);
    const mapEst = mapearEstadoExcel(estadoExcel);

    // Si Estado pide OC pero no hay PO, para "cerrada" usar NA; para distribuida avisar
    let crearOc = mapEst.crearOc;
    let ocEstado = mapEst.ocEstado;
    let po = poInfo.po;
    let poNa = poInfo.esNa;
    const avisos = [];

    if (mapEst.desconecido) {
      avisos.push(`Estado Excel no reconocido: "${estadoExcel}"`);
    }

    if (crearOc) {
      if (poInfo.sinPo) {
        if (ocEstado === 'cerrada' || ocEstado === 'cancelada') {
          po = 'NA';
          poNa = true;
        } else if (ocEstado === 'distribuida') {
          // Distribuida sin PO es inconsistente; se crea con NA y nota
          po = 'NA';
          poNa = true;
          avisos.push('Estado Distribuida sin PO numérico — se asignó NA');
        }
      }
    }

    // Cancelada: no OC por defecto; si trae PO real, opcionalmente se podría crear cancelada
    // (acordado: solo REQ rechazado)
    const notasParts = [
      descripcion,
      statusTxt ? `Status: ${statusTxt}` : '',
      avisos.length ? `Import: ${avisos.join('; ')}` : '',
    ].filter(Boolean);

    filas.push({
      filaExcel: r + 1,
      layout: 'base_gral',
      consecutivo,
      tipo: detectarTipo(consecutivo, tipoExcel),
      fecha_sol: excelDateToISO(row[3]),
      fecha_po: excelDateToISO(row[1]),
      proveedor,
      area: depto || null,
      departamento: null,
      titulo: descripcion || consecutivo,
      descripcion,
      notas: notasParts.join(' | '),
      status_texto: statusTxt,
      usuario,
      oc_numero: po,
      po_na: poNa,
      sin_po: poInfo.sinPo && !poNa,
      total: row[6] !== '' && row[6] != null ? parseFloat(String(row[6]).replace(',', '')) || null : null,
      moneda: String(row[7] || '').trim() || null,
      estado_excel: estadoExcel,
      reqEstado: mapEst.reqEstado,
      crearOc,
      ocEstado,
      avisos,
      codigo_sugerido: extraerCodigoDesdeDescripcion(descripcion),
    });
    meta.baseGral += 1;
  }
}

// ── PARSE público ─────────────────────────────────────────────────────────────

/**
 * Parsea buffer .xlsx. Detecta layout BASE GRAL vs legacy.
 * Deduplica por consecutivo (se conserva la primera fila; las demás van a duplicados).
 *
 * @returns {{
 *   filas: object[],
 *   duplicados: object[],
 *   hojasSaltadas: string[],
 *   layout: 'base_gral'|'legacy'|'mixto',
 *   meta: object
 * }}
 */
export function parseExcelRequerimientos(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const filas = [];
  const meta = {
    baseGral: 0,
    legacy: 0,
    sinConsecutivo: [],
    hojas: [],
  };
  const hojasSaltadas = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws?.['!ref']) {
      hojasSaltadas.push(sheetName);
      continue;
    }
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!data.length) {
      hojasSaltadas.push(sheetName);
      continue;
    }

    const header = data[0];
    const nameUp = String(sheetName).toUpperCase();
    let modo = null;

    if (esLayoutBaseGral(header)) {
      modo = 'base_gral';
    } else if (nameUp === 'SERVICIOS' || nameUp === 'PARTES' || nameUp === 'FLETES') {
      modo = 'legacy';
    } else if (esLayoutLegacyHeader(header)) {
      modo = 'legacy';
    } else if (wb.SheetNames.length === 1) {
      // Una sola hoja sin header claro: intentar BASE GRAL si col2 parece consecutivo
      const sample = data.slice(1, 15).find((r) => r && r[2]);
      if (sample && /^\d{4}[PSF]-/i.test(String(sample[2]))) {
        modo = 'base_gral';
      } else if (sample && /^\d{4}[PSF]-/i.test(String(sample[0]))) {
        modo = 'legacy';
      }
    }

    if (!modo) {
      hojasSaltadas.push(sheetName);
      continue;
    }

    meta.hojas.push({ sheetName, modo });
    if (modo === 'base_gral') parseHojaBaseGral(data, filas, meta);
    else parseHojaLegacy(data, filas, meta);
  }

  // Deduplicar por consecutivo (A/B/C son distintos; solo idénticos son error)
  const seen = new Map();
  const unicas = [];
  const duplicados = [];
  for (const f of filas) {
    const key = String(f.consecutivo).trim().toUpperCase();
    if (seen.has(key)) {
      duplicados.push({
        ...f,
        originalFila: seen.get(key),
        motivo: 'Consecutivo duplicado en archivo — se conserva solo la primera aparición',
      });
      continue;
    }
    seen.set(key, f.filaExcel);
    unicas.push(f);
  }

  let layout = 'legacy';
  if (meta.baseGral && meta.legacy) layout = 'mixto';
  else if (meta.baseGral) layout = 'base_gral';

  return {
    filas: unicas,
    duplicados,
    hojasSaltadas,
    layout,
    meta,
  };
}

// ── COLORES / EXPORT (sin cambios de contrato) ────────────────────────────────

const FILL_ROSA = { fgColor: { rgb: 'E59EDD' } };
const FILL_VERDE = { fgColor: { rgb: 'B4E5A2' } };
const FILL_AMARILLO = { fgColor: { rgb: 'FFFF00' } };
const FILL_NONE = {};

function fillPorEstado(req) {
  if (req.estado === 'rechazado') return FILL_AMARILLO;
  if (req.estado !== 'aprobado' && req.estado !== 'cerrado') return FILL_NONE;
  if (req.oc_estado === 'cerrada' || req.oc_estado === 'recibida') return FILL_ROSA;
  if (req.oc_estado) return FILL_VERDE;
  return FILL_NONE;
}

function cellStyle(fill) {
  if (!fill.fgColor) return {};
  return { fill: { patternType: 'solid', fgColor: fill.fgColor } };
}

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '1E3A5F' } },
  alignment: { horizontal: 'center' },
};

/**
 * Genera Excel de exportación en layout BASE GRAL (PO → Fecha → N°…),
 * alineado al archivo de Contabilidad.
 */
export function generarExcelRequerimientos(reqs) {
  const wb = XLSX.utils.book_new();

  const HEADERS = [
    'Orden de compra',
    'Fecha',
    'N°',
    'Fecha de solicitud',
    'Tipo',
    'Proveedor',
    'Total',
    'Moneda',
    'Usuario',
    'Estado',
    'Depto',
    'Compañía',
    'Tipo de servicio',
    'Usuario',
    'Status',
  ];

  const formatDate = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const statusText = (req) => {
    if (req.estado === 'rechazado') return 'RECHAZADO';
    if (req.estado === 'borrador') return 'BORRADOR';
    if (req.estado === 'en_revision') return 'EN REVISIÓN';
    if (req.estado === 'incompleto') return 'INCOMPLETO';
    if (req.oc_estado === 'cerrada' || req.oc_estado === 'recibida') return 'Cerrada';
    if (req.oc_estado === 'distribuida') return 'Distribuida';
    if (req.oc_estado) return 'En proceso';
    if (req.estado === 'cerrado') return 'Cerrado';
    if (req.estado === 'aprobado') return 'Aprobado';
    return String(req.estado || '').toUpperCase();
  };

  const TIPOS = ['PARTES', 'SERVICIOS', 'FLETES'];
  let algunaHoja = false;

  for (const tipo of TIPOS) {
    const reqs_tipo = reqs.filter((r) => (r.tipo || 'SERVICIOS') === tipo);
    if (!reqs_tipo.length) continue;
    algunaHoja = true;

    const wsData = [HEADERS];
    const wsStyles = [HEADERS.map(() => HEADER_STYLE)];

    for (const req of reqs_tipo) {
      const fill = fillPorEstado(req);
      const style = cellStyle(fill);
      const prov =
        req.proveedor_num && req.proveedor_nombre
          ? `${req.proveedor_num}-${req.proveedor_nombre}`
          : req.proveedor_nombre || '';

      const rowData = [
        req.oc_datatextnow_id || req.oc_numero || '',
        req.oc_fecha_po ? formatDate(req.oc_fecha_po) : '',
        req.consecutivo,
        formatDate(req.created_at),
        req.tipo || '',
        prov,
        req.oc_monto_total != null ? Number(req.oc_monto_total) : '',
        req.oc_moneda || '',
        req.solicitante_nombre || '',
        statusText(req),
        req.area || req.departamento || '',
        '31',
        req.titulo_solicitud || req.notas || '',
        req.solicitante_nombre || '',
        req.notas || '',
      ];
      wsData.push(rowData);
      wsStyles.push(rowData.map(() => style));
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = wsStyles[R]?.[C] || {};
      }
    }
    ws['!cols'] = [
      { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
      { wch: 32 }, { wch: 12 }, { wch: 8 }, { wch: 22 }, { wch: 14 },
      { wch: 18 }, { wch: 8 }, { wch: 40 }, { wch: 18 }, { wch: 36 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, tipo);
  }

  // Si no hay datos, hoja vacía con headers
  if (!algunaHoja) {
    const ws = XLSX.utils.aoa_to_sheet([HEADERS]);
    XLSX.utils.book_append_sheet(wb, ws, 'PARTES');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
}
