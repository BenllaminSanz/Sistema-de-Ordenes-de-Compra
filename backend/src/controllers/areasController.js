// backend/src/controllers/areasController.js
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const JSON_PATH = join(__dirname, '../config/departamentos.json');

// ── helpers ──────────────────────────────────────────────────────────────────

async function leerJSON() {
  const raw = await readFile(JSON_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function escribirJSON(data) {
  await writeFile(JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ── GET /api/areas ────────────────────────────────────────────────────────────
// Todos los roles autenticados. Devuelve todas las áreas y departamentos.
export async function getAreas(req, res) {
  try {
    const data = await leerJSON();
    return res.json({ areas: data.areas });
  } catch (err) {
    console.error('getAreas:', err);
    return res.status(500).json({ mensaje: 'Error al leer configuración de áreas' });
  }
}

// ── POST /api/areas ───────────────────────────────────────────────────────────
// Body: { id, label }
export async function crearArea(req, res) {
  try {
    let { id, label } = req.body;

    if (!id || !label) {
      return res.status(400).json({ mensaje: 'id y label son requeridos' });
    }

    id    = String(id).trim().toUpperCase().replace(/\s+/g, '_');
    label = String(label).trim();

    const data = await leerJSON();

    if (data.areas.some(a => a.id === id)) {
      return res.status(409).json({ mensaje: `Ya existe un área con id "${id}"` });
    }

    const nueva = { id, label, departamentos: [] };
    data.areas.push(nueva);
    await escribirJSON(data);

    return res.status(201).json({ mensaje: 'Área creada', area: nueva });
  } catch (err) {
    console.error('crearArea:', err);
    return res.status(500).json({ mensaje: 'Error al crear área' });
  }
}

// ── PUT /api/areas/:id ────────────────────────────────────────────────────────
// Body: { label }
export async function actualizarArea(req, res) {
  try {
    const id    = req.params.id;
    const { label } = req.body;

    if (!label) {
      return res.status(400).json({ mensaje: 'label es requerido' });
    }

    const data = await leerJSON();
    const area = data.areas.find(a => a.id === id);

    if (!area) {
      return res.status(404).json({ mensaje: `Área "${id}" no encontrada` });
    }

    area.label = String(label).trim();
    await escribirJSON(data);
    return res.json({ mensaje: 'Área actualizada', area });
  } catch (err) {
    console.error('actualizarArea:', err);
    return res.status(500).json({ mensaje: 'Error al actualizar área' });
  }
}

// ── DELETE /api/areas/:id — eliminación real ──────────────────────────────────
export async function eliminarArea(req, res) {
  try {
    const id   = req.params.id;
    const data = await leerJSON();
    const idx  = data.areas.findIndex(a => a.id === id);

    if (idx === -1) {
      return res.status(404).json({ mensaje: `Área "${id}" no encontrada` });
    }

    data.areas.splice(idx, 1);
    await escribirJSON(data);
    return res.json({ mensaje: 'Área eliminada' });
  } catch (err) {
    console.error('eliminarArea:', err);
    return res.status(500).json({ mensaje: 'Error al eliminar área' });
  }
}

// ── POST /api/areas/:id/departamentos ─────────────────────────────────────────
// Body: { nombre }
export async function crearDepartamento(req, res) {
  try {
    const id = req.params.id;
    let { nombre } = req.body;

    if (!nombre) {
      return res.status(400).json({ mensaje: 'nombre es requerido' });
    }

    nombre = String(nombre).trim().toUpperCase();

    const data = await leerJSON();
    const area = data.areas.find(a => a.id === id);

    if (!area) {
      return res.status(404).json({ mensaje: `Área "${id}" no encontrada` });
    }

    if (area.departamentos.some(d => d.nombre === nombre)) {
      return res.status(409).json({ mensaje: `Ya existe el departamento "${nombre}" en esta área` });
    }

    const depto = { nombre };
    area.departamentos.push(depto);
    await escribirJSON(data);

    return res.status(201).json({ mensaje: 'Departamento creado', departamento: depto });
  } catch (err) {
    console.error('crearDepartamento:', err);
    return res.status(500).json({ mensaje: 'Error al crear departamento' });
  }
}

// ── PUT /api/areas/:id/departamentos/:nombre ──────────────────────────────────
// Body: { nombre } — renombrar
export async function actualizarDepartamento(req, res) {
  try {
    const id          = req.params.id;
    const nombreActual = decodeURIComponent(req.params.nombre);
    const { nombre: nuevoNombre } = req.body;

    if (!nuevoNombre) {
      return res.status(400).json({ mensaje: 'nombre es requerido' });
    }

    const data = await leerJSON();
    const area = data.areas.find(a => a.id === id);

    if (!area) {
      return res.status(404).json({ mensaje: `Área "${id}" no encontrada` });
    }

    const depto = area.departamentos.find(d => d.nombre === nombreActual);
    if (!depto) {
      return res.status(404).json({ mensaje: `Departamento "${nombreActual}" no encontrado` });
    }

    const nombreNorm = String(nuevoNombre).trim().toUpperCase();
    if (nombreNorm !== nombreActual && area.departamentos.some(d => d.nombre === nombreNorm)) {
      return res.status(409).json({ mensaje: `Ya existe el departamento "${nombreNorm}" en esta área` });
    }

    depto.nombre = nombreNorm;
    await escribirJSON(data);
    return res.json({ mensaje: 'Departamento actualizado', departamento: depto });
  } catch (err) {
    console.error('actualizarDepartamento:', err);
    return res.status(500).json({ mensaje: 'Error al actualizar departamento' });
  }
}

// ── DELETE /api/areas/:id/departamentos/:nombre — eliminación real ─────────────
export async function eliminarDepartamento(req, res) {
  try {
    const id     = req.params.id;
    const nombre = decodeURIComponent(req.params.nombre);

    const data = await leerJSON();
    const area = data.areas.find(a => a.id === id);

    if (!area) {
      return res.status(404).json({ mensaje: `Área "${id}" no encontrada` });
    }

    const idx = area.departamentos.findIndex(d => d.nombre === nombre);
    if (idx === -1) {
      return res.status(404).json({ mensaje: `Departamento "${nombre}" no encontrado` });
    }

    area.departamentos.splice(idx, 1);
    await escribirJSON(data);
    return res.json({ mensaje: 'Departamento eliminado' });
  } catch (err) {
    console.error('eliminarDepartamento:', err);
    return res.status(500).json({ mensaje: 'Error al eliminar departamento' });
  }
}
