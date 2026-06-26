/**
 * API de departamentos — delega en departamentos.json vía departamentosStore.
 * Mantiene exports compatibles con código que importaba la lista estática.
 */
import {
  cargarConfigSync,
  listarDepartamentosPlanos,
  validarAreaDepartamento,
  obtenerAreas,
} from './departamentosStore.js';

export { validarAreaDepartamento, obtenerAreas };

/** @deprecated Usar obtenerAreas() / listarDepartamentosPlanos() */
export function getDepartamentosLegacy() {
  const data = cargarConfigSync();
  const out = [];
  for (const area of data.areas || []) {
    for (const d of area.departamentos || []) {
      out.push({
        codigo: d.codigo || null,
        grupo: area.label,
        nombre: d.nombre,
        area_id: area.id,
      });
    }
  }
  return out;
}

export async function getDEPARTAMENTOS() {
  return listarDepartamentosPlanos();
}

export async function getDEPARTAMENTOS_VALIDOS() {
  const planos = await listarDepartamentosPlanos();
  return new Set(planos.map(d => d.nombre));
}

export async function departamentosPorGrupo() {
  const areas = await obtenerAreas();
  const grupos = {};
  for (const area of areas) {
    grupos[area.label] = (area.departamentos || []).map(d => ({
      codigo: d.codigo,
      nombre: d.nombre,
    }));
  }
  return grupos;
}