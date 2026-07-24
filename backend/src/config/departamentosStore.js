/**
 * Fuente única de áreas y departamentos (departamentos.json).
 * Lectura/escritura, validación área↔departamento e historial de cambios.
 */
import { readFile, writeFile, appendFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, 'departamentos.json');
const HISTORIAL_PATH = join(__dirname, 'departamentos_historial.jsonl');

let cache = null;
let cacheMtime = 0;

async function statMtime() {
  try {
    const { stat } = await import('fs/promises');
    const s = await stat(JSON_PATH);
    return s.mtimeMs;
  } catch {
    return 0;
  }
}

export async function cargarConfig({ forzar = false } = {}) {
  const mtime = await statMtime();
  if (!forzar && cache && mtime === cacheMtime) return cache;

  const raw = await readFile(JSON_PATH, 'utf-8');
  cache = JSON.parse(raw);
  cacheMtime = mtime;
  return cache;
}

/** Lectura síncrona para arranque / imports puntuales */
export function cargarConfigSync() {
  const raw = readFileSync(JSON_PATH, 'utf-8');
  return JSON.parse(raw);
}

export async function guardarConfig(data) {
  await writeFile(JSON_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  cache = data;
  cacheMtime = await statMtime();
}

export function invalidarCache() {
  cache = null;
  cacheMtime = 0;
}

export async function obtenerAreas() {
  const data = await cargarConfig();
  return data.areas || [];
}

/** Lista plana { codigo, nombre, area_id, area_label } */
export async function listarDepartamentosPlanos() {
  const areas = await obtenerAreas();
  const out = [];
  for (const area of areas) {
    for (const d of area.departamentos || []) {
      out.push({
        codigo: d.codigo || null,
        nombre: d.nombre,
        area_id: area.id,
        area_label: area.label,
      });
    }
  }
  return out;
}

/** Comparación de área: id y label visibles son el mismo nombre (mayúsculas). */
function normalizarClaveArea(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita acentos solo para comparar
}

/** Clave de departamento: mayúsculas + sin acentos (misma base que área). */
function normalizarClaveDepto(valor) {
  return normalizarClaveArea(valor);
}

/**
 * Construye el índice a partir de un arreglo de áreas (sync).
 */
export function construirIndiceDesdeAreas(areas) {
  const porArea = new Map(); // clave área → { id, label, departamentos[] }
  const porDepto = new Map(); // clave depto → { area, depto }
  const deptosDeArea = new Map(); // clave área → string[] nombres depto

  for (const area of areas || []) {
    const entry = {
      id: area.id,
      label: area.label || area.id,
      departamentos: area.departamentos || [],
    };
    const keys = new Set([
      normalizarClaveArea(area.id),
      normalizarClaveArea(area.label),
    ]);
    for (const k of keys) {
      if (k) porArea.set(k, entry);
    }

    const nombresDepto = [];
    for (const d of area.departamentos || []) {
      const nombre = String(d.nombre || '').trim();
      if (!nombre) continue;
      nombresDepto.push(nombre);
      const dk = normalizarClaveDepto(nombre);
      // Si un depto se repite en varias áreas, conservar el primero
      if (dk && !porDepto.has(dk)) {
        porDepto.set(dk, { area: entry, depto: d });
      }
    }
    for (const k of keys) {
      if (k) deptosDeArea.set(k, nombresDepto);
    }
  }

  return { porArea, porDepto, deptosDeArea };
}

/**
 * Índice en memoria para resolver área↔depto (datos legacy y catálogo).
 * El import histórico guardó el nombre de depto en `requerimientos.area`
 * y dejó `departamento` vacío; a veces ambos campos vienen intercambiados.
 */
export async function construirIndiceAreasDeptos() {
  const areas = await obtenerAreas();
  return construirIndiceDesdeAreas(areas);
}

/** Versión síncrona (import Excel / scripts). */
export function construirIndiceAreasDeptosSync() {
  const data = cargarConfigSync();
  return construirIndiceDesdeAreas(data.areas || []);
}

/**
 * Corrige área/departamento para la vista y reportes.
 *
 * Casos:
 * - Correcto: area = área del catálogo, departamento = depto hijo
 * - Legacy: solo `area` relleno con nombre de depto → se infiere el área padre
 * - Invertido: area tiene depto y departamento tiene área → se intercambian
 * - Solo depto: se infiere el área si está en el catálogo
 *
 * @returns {{ area: string|null, departamento: string|null, departamento_codigo: string|null, resuelto: boolean, fuente: string }}
 */
export function resolverAreaDepartamentoVista(areaStored, deptoStored, indice) {
  const aRaw = String(areaStored ?? '').trim() || null;
  const dRaw = String(deptoStored ?? '').trim() || null;
  const aKey = aRaw ? normalizarClaveArea(aRaw) : '';
  const dKey = dRaw ? normalizarClaveDepto(dRaw) : '';

  const empty = {
    area: aRaw,
    departamento: dRaw,
    departamento_codigo: null,
    resuelto: false,
    fuente: 'sin_datos',
  };
  if (!aRaw && !dRaw) return empty;
  if (!indice) {
    return { ...empty, fuente: 'sin_indice' };
  }

  const { porArea, porDepto } = indice;

  // A) Ambos rellenos y válidos en catálogo
  if (aRaw && dRaw) {
    const areaObj = porArea.get(aKey);
    if (areaObj) {
      const deptoMatch = (areaObj.departamentos || []).find(
        (d) => normalizarClaveDepto(d.nombre) === dKey
      );
      if (deptoMatch) {
        return {
          area: areaObj.label,
          departamento: deptoMatch.nombre,
          departamento_codigo: deptoMatch.codigo || null,
          resuelto: true,
          fuente: 'catalogo',
        };
      }
    }

    // B) Invertidos: "area" es depto y "departamento" es área
    const deptoEnArea = porDepto.get(aKey);
    const areaEnDepto = porArea.get(dKey);
    if (deptoEnArea && areaEnDepto) {
      // Preferir el depto localizado por nombre (puede estar en otra área del catálogo)
      return {
        area: deptoEnArea.area.label,
        departamento: deptoEnArea.depto.nombre,
        departamento_codigo: deptoEnArea.depto.codigo || null,
        resuelto: true,
        fuente: 'invertido',
      };
    }
    if (deptoEnArea && !areaObj) {
      return {
        area: deptoEnArea.area.label,
        departamento: deptoEnArea.depto.nombre,
        departamento_codigo: deptoEnArea.depto.codigo || null,
        resuelto: true,
        fuente: 'invertido_parcial',
      };
    }
  }

  // C) Solo "area" (import legacy: depto en columna Area)
  if (aRaw && !dRaw) {
    const comoDepto = porDepto.get(aKey);
    if (comoDepto) {
      return {
        area: comoDepto.area.label,
        departamento: comoDepto.depto.nombre,
        departamento_codigo: comoDepto.depto.codigo || null,
        resuelto: true,
        fuente: 'legacy_depto_en_area',
      };
    }
    const comoArea = porArea.get(aKey);
    if (comoArea) {
      return {
        area: comoArea.label,
        departamento: null,
        departamento_codigo: null,
        resuelto: true,
        fuente: 'solo_area',
      };
    }
    // Valor desconocido: históricamente venía de "Depto" → mostrar en Departamento
    return {
      area: null,
      departamento: aRaw,
      departamento_codigo: null,
      resuelto: false,
      fuente: 'legacy_desconocido',
    };
  }

  // D) Solo departamento
  if (!aRaw && dRaw) {
    const comoDepto = porDepto.get(dKey);
    if (comoDepto) {
      return {
        area: comoDepto.area.label,
        departamento: comoDepto.depto.nombre,
        departamento_codigo: comoDepto.depto.codigo || null,
        resuelto: true,
        fuente: 'solo_depto',
      };
    }
    return {
      area: null,
      departamento: dRaw,
      departamento_codigo: null,
      resuelto: false,
      fuente: 'solo_depto_desconocido',
    };
  }

  // E) Ambos rellenos pero no casan con catálogo: devolver tal cual
  return {
    area: aRaw,
    departamento: dRaw,
    departamento_codigo: null,
    resuelto: false,
    fuente: 'sin_match',
  };
}

/** Aplica resolución de vista sobre un objeto con area/departamento. */
export function aplicarVistaAreaDepto(row, indice) {
  if (!row) return row;
  const r = resolverAreaDepartamentoVista(row.area, row.departamento, indice);
  row.area = r.area;
  row.departamento = r.departamento;
  if (r.departamento_codigo) {
    row.departamento_codigo = r.departamento_codigo;
  } else if (row.departamento_codigo == null) {
    row.departamento_codigo = null;
  }
  return row;
}

export async function validarAreaDepartamento(areaId, departamentoNombre) {
  if (!areaId || !departamentoNombre) {
    return { ok: false, mensaje: 'Área y departamento son requeridos' };
  }

  const areaKey = normalizarClaveArea(areaId);
  const deptoNorm = String(departamentoNombre).trim().toUpperCase();
  const areas = await obtenerAreas();
  // Coincidir por id o label (ahora id = nombre visible)
  const area = areas.find(
    (a) => normalizarClaveArea(a.id) === areaKey || normalizarClaveArea(a.label) === areaKey
  );

  if (!area) {
    return { ok: false, mensaje: `El área "${String(areaId).trim()}" no existe en el catálogo` };
  }

  const depto = (area.departamentos || []).find(
    (d) => String(d.nombre).trim().toUpperCase() === deptoNorm
  );
  if (!depto) {
    return {
      ok: false,
      mensaje: `El departamento "${deptoNorm}" no pertenece al área "${area.label}"`,
    };
  }

  return { ok: true, area, departamento: depto };
}

export async function registrarHistorial({ usuario, accion, detalle = {} }) {
  const entry = {
    at: new Date().toISOString(),
    usuario_id: usuario?.id ?? null,
    usuario_nombre: usuario?.nombre ?? 'sistema',
    accion,
    detalle,
  };
  await appendFile(HISTORIAL_PATH, `${JSON.stringify(entry)}\n`, 'utf-8');
  return entry;
}

export async function leerHistorial(limite = 50) {
  try {
    const raw = await readFile(HISTORIAL_PATH, 'utf-8');
    const lineas = raw.trim().split('\n').filter(Boolean);
    return lineas
      .slice(-limite)
      .map(l => JSON.parse(l))
      .reverse();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export function normalizarCodigoDTN(valor) {
  if (valor == null || valor === '') return null;
  return String(valor).trim().toUpperCase();
}

export function normalizarNombreDepto(valor) {
  return String(valor).trim().toUpperCase();
}