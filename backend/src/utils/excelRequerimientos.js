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
import {
  construirIndiceAreasDeptosSync,
  resolverAreaDepartamentoVista,
} from '../config/departamentosStore.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

/** Resuelve área/depto del Excel al modelo del catálogo (área padre + depto). */
function normalizarAreaDeptoImport(areaVal, deptoVal, indice) {
  const r = resolverAreaDepartamentoVista(areaVal, deptoVal, indice);
  return {
    area: r.area || null,
    departamento: r.departamento || null,
  };
}

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
  const indice = construirIndiceAreasDeptosSync();
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

    // Columna 3 = Depto (legacy): resolver área padre vía catálogo
    const deptoExcel = String(row[3] || '').trim() || null;
    const ad = normalizarAreaDeptoImport(deptoExcel, null, indice);

    filas.push({
      filaExcel: r + 1,
      layout: 'legacy',
      consecutivo,
      tipo: detectarTipo(consecutivo),
      fecha_sol: excelDateToISO(row[1]),
      fecha_po: excelDateToISO(row[9]),
      proveedor: String(row[2] || '').trim(),
      area: ad.area,
      departamento: ad.departamento,
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

/**
 * Resuelve índices de columna para BASE GRAL.
 * - Unificado (export actual): No. proveedor | Proveedor | … | Area | Departamento | …
 * - Legacy Contabilidad: Proveedor combinado | … | Depto | …
 */
function resolverMapaBaseGral(headerRow) {
  // Defaults = layout unificado (export General / REQ / OC)
  const map = {
    po: 0,
    fechaPo: 1,
    n: 2,
    fechaSol: 3,
    tipo: 4,
    noProv: 5,
    proveedor: 6,
    total: 7,
    moneda: 8,
    usuario: 9,
    estado: 10,
    area: 11,
    departamento: 12,
    compania: 13,
    tipoServicio: 14,
    usuario2: 15,
    status: 16,
    legacy: false,
  };

  if (!headerRow || !Array.isArray(headerRow)) return map;

  const cells = headerRow.map(normHeader);
  const findIdx = (...patterns) => {
    for (let i = 0; i < cells.length; i++) {
      for (const p of patterns) {
        if (p.test(cells[i])) return i;
      }
    }
    return -1;
  };

  const hasNoProv = cells.some((c) => /no\.?\s*proveedor|num(ero)?\s*proveedor|vendor/.test(c));
  const hasArea = cells.some((c) => c === 'area' || c === 'área' || c === 'area ');
  const hasDeptoSolo = cells.some((c) => c === 'depto' || c === 'departamento' || c.includes('depto'));
  // Layout viejo: sin "No. proveedor" y con columna Depto (no Area+Departamento)
  const esLegacy =
    !hasNoProv &&
    hasDeptoSolo &&
    !cells.some((c) => c === 'area') &&
    cells.length <= 16;

  if (esLegacy || (!hasNoProv && cells[5] && !/no\.?\s*proveedor|num/.test(cells[5]))) {
    // Layout Contabilidad original (15 cols)
    return {
      po: 0,
      fechaPo: 1,
      n: 2,
      fechaSol: 3,
      tipo: 4,
      noProv: -1,
      proveedor: 5,
      total: 6,
      moneda: 7,
      usuario: 8,
      estado: 9,
      area: 10, // Depto → area al importar (histórico)
      departamento: -1,
      compania: 11,
      tipoServicio: 12,
      usuario2: 13,
      status: 14,
      legacy: true,
    };
  }

  // Layout unificado: preferir detección por nombre de encabezado
  const setIf = (key, ...patterns) => {
    const i = findIdx(...patterns);
    if (i >= 0) map[key] = i;
  };
  setIf('po', /orden de compra/, /^po$/, /^oc$/);
  setIf('fechaPo', /^fecha$/, /fecha\s*(de\s*)?po/, /fecha\s*po/);
  setIf('n', /^n$/, /^n°$/, /^nº$/, /^no\.?$/, /consecutivo/);
  setIf('fechaSol', /fecha de solicitud/, /fecha\s*sol/);
  setIf('tipo', /^tipo$/);
  setIf('noProv', /no\.?\s*proveedor/, /num(ero)?\s*proveedor/, /^vendor/);
  setIf('proveedor', /^proveedor$/, /nombre\s*proveedor/, /^supplier$/);
  setIf('total', /^total$/);
  setIf('moneda', /^moneda$/, /^currency$/);
  setIf('usuario', /^usuario$/);
  setIf('estado', /^estado$/);
  setIf('area', /^area$/, /^área$/);
  setIf('departamento', /^departamento$/, /^depto$/);
  setIf('compania', /compania/, /compañia/, /company/);
  setIf('tipoServicio', /tipo de servicio/, /^descripcion$/, /^description$/);
  setIf('status', /^status$/, /^estatus$/);

  // Segunda columna Usuario (si hay dos)
  const usuarioIdxs = cells
    .map((c, i) => (c === 'usuario' ? i : -1))
    .filter((i) => i >= 0);
  if (usuarioIdxs.length >= 2) {
    map.usuario = usuarioIdxs[0];
    map.usuario2 = usuarioIdxs[1];
  }

  return map;
}

function cellAt(row, idx) {
  if (idx == null || idx < 0 || !row) return '';
  const v = row[idx];
  if (v == null || v === '') return '';
  return v;
}

function parseHojaBaseGral(data, filas, meta) {
  const map = resolverMapaBaseGral(data[0] || []);
  if (map.legacy) meta.layoutBaseGral = 'legacy_depto';
  else meta.layoutBaseGral = 'unificado';
  const indice = construirIndiceAreasDeptosSync();

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;

    const consecutivo =
      cellAt(row, map.n) != null && cellAt(row, map.n) !== ''
        ? String(cellAt(row, map.n)).trim()
        : '';
    const ocRaw = cellAt(row, map.po);
    const descripcion = String(cellAt(row, map.tipoServicio) || '').trim();
    const noProv = map.noProv >= 0 ? String(cellAt(row, map.noProv) || '').trim() : '';
    const nombreProv = String(cellAt(row, map.proveedor) || '').trim();
    // Proveedor combinado o "num-nombre"
    let proveedor = nombreProv;
    if (noProv && nombreProv && !nombreProv.startsWith(noProv)) {
      proveedor = `${noProv}-${nombreProv}`;
    } else if (noProv && !nombreProv) {
      proveedor = noProv;
    }
    const usuario =
      String(cellAt(row, map.usuario) || '').trim() ||
      String(cellAt(row, map.usuario2) || '').trim();
    const estadoExcel = String(cellAt(row, map.estado) || '').trim();
    const statusTxt = String(cellAt(row, map.status) || '').trim();
    const tipoExcel = String(cellAt(row, map.tipo) || '').trim();
    const areaVal = String(cellAt(row, map.area) || '').trim() || null;
    const deptoVal =
      map.departamento >= 0
        ? String(cellAt(row, map.departamento) || '').trim() || null
        : null;
    // Layout legacy BASE GRAL: col "Depto" mapeada a map.area → resolver a área+depto
    const ad = map.legacy
      ? normalizarAreaDeptoImport(areaVal, null, indice)
      : normalizarAreaDeptoImport(areaVal, deptoVal, indice);

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

    const totalRaw = cellAt(row, map.total);
    const monedaRaw = cellAt(row, map.moneda);

    filas.push({
      filaExcel: r + 1,
      layout: 'base_gral',
      consecutivo,
      tipo: detectarTipo(consecutivo, tipoExcel),
      fecha_sol: excelDateToISO(cellAt(row, map.fechaSol)),
      fecha_po: excelDateToISO(cellAt(row, map.fechaPo)),
      proveedor,
      area: ad.area,
      departamento: ad.departamento,
      titulo: descripcion || consecutivo,
      descripcion,
      notas: notasParts.join(' | '),
      status_texto: statusTxt,
      usuario,
      oc_numero: po,
      po_na: poNa,
      sin_po: poInfo.sinPo && !poNa,
      total:
        totalRaw !== '' && totalRaw != null
          ? parseFloat(String(totalRaw).replace(/,/g, '')) || null
          : null,
      moneda: String(monedaRaw || '').trim() || null,
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

// ── COLORES / EXPORT BASE GRAL ────────────────────────────────────────────────

const FILL_ROSA = { fgColor: { rgb: 'E59EDD' } };
const FILL_VERDE = { fgColor: { rgb: 'B4E5A2' } };
const FILL_AMARILLO = { fgColor: { rgb: 'FFFF00' } };
const FILL_NONE = {};

/**
 * Layout unificado BASE GRAL — General (Dashboard), REQ y OC.
 * No. proveedor separado; Area + Departamento (reemplaza Centro/Depto).
 */
export const HEADERS_BASE_GRAL = [
  'Orden de compra',
  'Fecha',
  'N°',
  'Fecha de solicitud',
  'Tipo',
  'No. proveedor',
  'Proveedor',
  'Total',
  'Moneda',
  'Usuario',
  'Estado',
  'Area',
  'Departamento',
  'Compañía',
  'Tipo de servicio',
  'Usuario',
  'Status',
];

/** @deprecated alias — mismo layout unificado */
export const HEADERS_BASE_GRAL_ANUAL = HEADERS_BASE_GRAL;

const COLS_BASE_GRAL = [
  { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
  { wch: 12 }, { wch: 36 }, { wch: 12 }, { wch: 8 }, { wch: 22 },
  { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 8 }, { wch: 44 },
  { wch: 22 }, { wch: 36 },
];

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '1E3A5F' } },
  alignment: { horizontal: 'center' },
};

function fillPorEstadoSistema({ estado, oc_estado }) {
  if (estado === 'rechazado' || oc_estado === 'cancelada') return FILL_AMARILLO;
  if (estado !== 'aprobado' && estado !== 'cerrado') return FILL_NONE;
  if (oc_estado === 'cerrada' || oc_estado === 'recibida') return FILL_ROSA;
  if (oc_estado) return FILL_VERDE;
  return FILL_NONE;
}

function cellStyle(fill) {
  if (!fill?.fgColor) return {};
  return { fill: { patternType: 'solid', fgColor: fill.fgColor } };
}

/** Formato de fecha dd/mm/yyyy como en el Excel de Contabilidad. */
export function formatFechaBaseGral(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [y, m, d] = v.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Columna "Estado" del BASE GRAL (etiquetas Contabilidad).
 * Prioriza estado de OC cuando existe.
 */
export function estadoExcelDesdeSistema({ estado, oc_estado } = {}) {
  if (oc_estado === 'cancelada' || estado === 'rechazado') return 'Cancelada';
  if (oc_estado === 'cerrada') return 'Cerrada';
  if (oc_estado === 'recibida') return 'Recibida';
  if (oc_estado === 'distribuida') return 'Distribuida';
  if (oc_estado === 'en_proceso') return 'En proceso';
  if (oc_estado === 'generada') return 'Generada';
  if (oc_estado) {
    return String(oc_estado).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }
  if (estado === 'borrador') return 'Borrador';
  if (estado === 'en_revision') return 'En revisión';
  if (estado === 'incompleto') return 'Incompleto';
  if (estado === 'aprobado') return 'Aprobado';
  if (estado === 'cerrado') return 'Cerrado';
  return String(estado || '').trim() || '';
}

/**
 * Formatea proveedor como en Contabilidad: "155-RIETER AMERICA LLC"
 */
export function formatoProveedorBaseGral(num, nombre) {
  const n = num != null && String(num).trim() !== '' ? String(num).trim() : '';
  const name = nombre != null ? String(nombre).trim() : '';
  if (n && name) return `${n}-${name}`;
  return name || n || '';
}

/**
 * Genera buffer xlsx en layout BASE GRAL unificado (General / REQ / OC).
 * Una sola hoja Hoja1 con No. proveedor + Area + Departamento.
 * @param {Array<object>} filas objetos normalizados o filas ya listas
 * @param {object} [opts]
 * @param {string} [opts.sheetName='Hoja1']
 */
export function generarExcelBaseGral(filas = [], opts = {}) {
  const sheetName = opts.sheetName || 'Hoja1';
  const headers = HEADERS_BASE_GRAL;

  const wb = XLSX.utils.book_new();
  const wsData = [headers];
  const wsStyles = [headers.map(() => HEADER_STYLE)];

  for (const f of filas) {
    const estado = f.estado != null ? f.estado : estadoExcelDesdeSistema({
      estado: f.req_estado || f.estado_req,
      oc_estado: f.oc_estado,
    });
    const fill = f._fill || fillPorEstadoSistema({
      estado: f.req_estado || f.estado_req || f.estado_sistema,
      oc_estado: f.oc_estado,
    });
    const style = cellStyle(fill);
    const usuario = f.usuario || f.solicitante_nombre || '';
    const total =
      f.total != null && f.total !== ''
        ? Number(f.total)
        : (f.oc_monto_total != null ? Number(f.oc_monto_total) : (f.monto_total != null ? Number(f.monto_total) : ''));
    const moneda = f.moneda ?? f.oc_moneda ?? '';
    const tipoServicio = f.tipo_servicio ?? f.titulo_solicitud ?? f.descripcion ?? f.notas ?? '';
    const status = f.status ?? f.status_texto ?? f.notas_status ?? '';

    const noProv =
      f.proveedor_num != null && String(f.proveedor_num).trim() !== ''
        ? String(f.proveedor_num).trim()
        : '';
    let nomFinal =
      f.proveedor_nombre != null && String(f.proveedor_nombre).trim() !== ''
        ? String(f.proveedor_nombre).trim()
        : '';
    let numFinal = noProv;
    // Si solo vino combinado "155-NOMBRE", intentar separar
    if (!numFinal && f.proveedor && String(f.proveedor).includes('-')) {
      const m = String(f.proveedor).match(/^(\d+)\s*-\s*(.+)$/);
      if (m) {
        numFinal = m[1];
        nomFinal = nomFinal || m[2].trim();
      }
    }
    if (!nomFinal && f.proveedor) {
      nomFinal = String(f.proveedor).replace(/^\d+\s*-\s*/, '').trim();
    }

    const rowData = [
      f.orden_compra ?? f.po ?? f.oc_datatextnow_id ?? f.oc_numero ?? '',
      f.fecha ?? (f.fecha_po ? formatFechaBaseGral(f.fecha_po) : ''),
      f.n ?? f.consecutivo ?? '',
      f.fecha_solicitud ?? (f.created_at || f.fecha_sol ? formatFechaBaseGral(f.created_at || f.fecha_sol) : ''),
      f.tipo || '',
      numFinal,
      nomFinal,
      total,
      moneda,
      usuario,
      estado,
      f.area ?? '',
      f.departamento ?? '',
      f.compania ?? f.compañia ?? '31',
      tipoServicio,
      f.usuario2 ?? usuario,
      status,
    ];

    wsData.push(rowData);
    wsStyles.push(rowData.map(() => style));
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      ws[addr].s = wsStyles[R]?.[C] || {};
    }
  }
  ws['!cols'] = COLS_BASE_GRAL;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
}

/**
 * Export de requerimientos → layout BASE GRAL unificado (igual que General y OC).
 */
export function generarExcelRequerimientos(reqs) {
  const indice = construirIndiceAreasDeptosSync();
  const filas = (reqs || []).map((req) => {
    const statusNotas = (() => {
      const n = String(req.notas || '');
      // Si las notas guardan "Status: …" del import, preferir solo esa bitácora
      const m = n.match(/Status:\s*(.+?)(?:\s*\|\s*Import:|$)/i);
      if (m) return m[1].trim();
      // Evitar duplicar la descripción completa en Status si ya va en Tipo de servicio
      if (n && n !== (req.titulo_solicitud || '')) return n;
      return '';
    })();

    const ad = resolverAreaDepartamentoVista(req.area, req.departamento, indice);

    return {
      orden_compra: req.oc_datatextnow_id || '',
      fecha_po: req.oc_fecha_po,
      consecutivo: req.consecutivo,
      created_at: req.created_at,
      tipo: req.tipo || '',
      proveedor_num: req.proveedor_num,
      proveedor_nombre: req.proveedor_nombre,
      oc_monto_total: req.oc_monto_total,
      oc_moneda: req.oc_moneda || '',
      solicitante_nombre: req.solicitante_nombre || '',
      estado: estadoExcelDesdeSistema({ estado: req.estado, oc_estado: req.oc_estado }),
      req_estado: req.estado,
      oc_estado: req.oc_estado,
      area: ad.area || '',
      departamento: ad.departamento || '',
      titulo_solicitud: req.titulo_solicitud || '',
      status: statusNotas,
      _fill: fillPorEstadoSistema({ estado: req.estado, oc_estado: req.oc_estado }),
    };
  });

  // Orden similar al archivo Contabilidad: por fecha PO / creación, luego N°
  filas.sort((a, b) => {
    const fa = a.fecha_po || a.created_at || '';
    const fb = b.fecha_po || b.created_at || '';
    const cmp = String(fa).localeCompare(String(fb));
    if (cmp !== 0) return cmp;
    return String(a.consecutivo || '').localeCompare(String(b.consecutivo || ''), 'es', { numeric: true });
  });

  return generarExcelBaseGral(filas);
}
