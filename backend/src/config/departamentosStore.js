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

export async function validarAreaDepartamento(areaId, departamentoNombre) {
  if (!areaId || !departamentoNombre) {
    return { ok: false, mensaje: 'Área y departamento son requeridos' };
  }

  const areaNorm = String(areaId).trim().toUpperCase();
  const deptoNorm = String(departamentoNombre).trim().toUpperCase();
  const areas = await obtenerAreas();
  const area = areas.find(a => a.id === areaNorm);

  if (!area) {
    return { ok: false, mensaje: `El área "${areaNorm}" no existe en el catálogo` };
  }

  const depto = (area.departamentos || []).find(d => d.nombre === deptoNorm);
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