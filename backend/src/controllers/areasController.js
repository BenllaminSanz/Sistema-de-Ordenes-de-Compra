import pool from '../config/db.js';
import {
  cargarConfig,
  guardarConfig,
  obtenerAreas,
  registrarHistorial,
  leerHistorial,
  normalizarCodigoDTN,
  normalizarNombreDepto,
} from '../config/departamentosStore.js';

async function contarUsoDepartamento(areaId, nombre) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM requerimientos
     WHERE area = ? AND departamento = ?`,
    [areaId, nombre]
  );
  return Number(row?.total) || 0;
}

async function contarUsoArea(areaId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM requerimientos WHERE area = ?`,
    [areaId]
  );
  return Number(row?.total) || 0;
}

// ── GET /api/areas ────────────────────────────────────────────
export async function getAreas(req, res) {
  try {
    const areas = await obtenerAreas();
    return res.json({ areas });
  } catch (err) {
    console.error('getAreas:', err);
    return res.status(500).json({ mensaje: 'Error al leer configuración de áreas' });
  }
}

// ── GET /api/areas/historial ──────────────────────────────────
export async function getHistorial(req, res) {
  try {
    const limite = Math.min(parseInt(req.query.limite, 10) || 50, 200);
    const entradas = await leerHistorial(limite);
    return res.json({ entradas });
  } catch (err) {
    console.error('getHistorial:', err);
    return res.status(500).json({ mensaje: 'Error al leer historial' });
  }
}

// ── GET /api/areas/:id/departamentos/:nombre/uso ──────────────
export async function getUsoDepartamento(req, res) {
  try {
    const areaId = decodeURIComponent(req.params.id);
    const nombre = decodeURIComponent(req.params.nombre);
    const total = await contarUsoDepartamento(areaId, nombre);
    return res.json({ area_id: areaId, departamento: nombre, requerimientos: total });
  } catch (err) {
    console.error('getUsoDepartamento:', err);
    return res.status(500).json({ mensaje: 'Error al consultar uso' });
  }
}

// ── POST /api/areas ───────────────────────────────────────────
export async function crearArea(req, res) {
  try {
    let { id, label } = req.body;
    // El nombre visible es la fuente de verdad: id = label
    label = String(label || id || '').trim().toUpperCase();
    if (!label) {
      return res.status(400).json({ mensaje: 'El nombre del área es requerido' });
    }
    id = label;

    const data = await cargarConfig();
    if (data.areas.some(a => a.id === id || a.label === label)) {
      return res.status(409).json({ mensaje: `Ya existe un área "${label}"` });
    }

    const nueva = { id, label, departamentos: [] };
    data.areas.push(nueva);
    await guardarConfig(data);

    await registrarHistorial({
      usuario: req.usuario,
      accion: 'area_creada',
      detalle: { area_id: id, label },
    });

    return res.status(201).json({ mensaje: 'Área creada', area: nueva });
  } catch (err) {
    console.error('crearArea:', err);
    return res.status(500).json({ mensaje: 'Error al crear área' });
  }
}

// ── PUT /api/areas/:id ──────────────────────────────────────────
export async function actualizarArea(req, res) {
  try {
    const idAnterior = decodeURIComponent(req.params.id);
    const { label } = req.body;
    if (!label) return res.status(400).json({ mensaje: 'label es requerido' });

    const data = await cargarConfig();
    const area = data.areas.find(a => a.id === idAnterior);
    if (!area) return res.status(404).json({ mensaje: `Área "${idAnterior}" no encontrada` });

    const labelAnterior = area.label;
    const labelNuevo = String(label).trim().toUpperCase();
    // Mantener id = nombre visible
    const idNuevo = labelNuevo;

    if (idNuevo !== idAnterior && data.areas.some(a => a.id === idNuevo && a !== area)) {
      return res.status(409).json({ mensaje: `Ya existe un área "${idNuevo}"` });
    }

    area.label = labelNuevo;
    area.id = idNuevo;
    await guardarConfig(data);

    // Actualizar REQs que tenían el id anterior
    if (idNuevo !== idAnterior) {
      await pool.query('UPDATE requerimientos SET area = ? WHERE area = ?', [idNuevo, idAnterior]);
    }

    await registrarHistorial({
      usuario: req.usuario,
      accion: 'area_actualizada',
      detalle: {
        area_id: idNuevo,
        area_id_anterior: idAnterior,
        label_anterior: labelAnterior,
        label_nuevo: labelNuevo,
      },
    });

    return res.json({ mensaje: 'Área actualizada', area });
  } catch (err) {
    console.error('actualizarArea:', err);
    return res.status(500).json({ mensaje: 'Error al actualizar área' });
  }
}

// ── DELETE /api/areas/:id ─────────────────────────────────────
export async function eliminarArea(req, res) {
  try {
    const id = decodeURIComponent(req.params.id);
    const data = await cargarConfig();
    const idx = data.areas.findIndex(a => a.id === id);
    if (idx === -1) return res.status(404).json({ mensaje: `Área "${id}" no encontrada` });

    const area = data.areas[idx];
    const reqs = await contarUsoArea(id);

    data.areas.splice(idx, 1);
    await guardarConfig(data);

    await registrarHistorial({
      usuario: req.usuario,
      accion: 'area_eliminada',
      detalle: {
        area_id: id,
        label: area.label,
        departamentos: area.departamentos.length,
        requerimientos_historicos: reqs,
      },
    });

    return res.json({
      mensaje: 'Área eliminada',
      requerimientos_historicos: reqs,
    });
  } catch (err) {
    console.error('eliminarArea:', err);
    return res.status(500).json({ mensaje: 'Error al eliminar área' });
  }
}

// ── POST /api/areas/:id/departamentos ─────────────────────────
export async function crearDepartamento(req, res) {
  try {
    const id = decodeURIComponent(req.params.id);
    let { nombre, codigo } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'nombre es requerido' });

    nombre = normalizarNombreDepto(nombre);
    codigo = normalizarCodigoDTN(codigo);

    const data = await cargarConfig();
    const area = data.areas.find(a => a.id === id);
    if (!area) return res.status(404).json({ mensaje: `Área "${id}" no encontrada` });

    if (area.departamentos.some(d => d.nombre === nombre)) {
      return res.status(409).json({ mensaje: `Ya existe el departamento "${nombre}" en esta área` });
    }

    if (codigo) {
      const duplicado = data.areas.some(a =>
        a.departamentos.some(d => d.codigo && d.codigo === codigo)
      );
      if (duplicado) {
        return res.status(409).json({ mensaje: `El código DTN "${codigo}" ya está en uso` });
      }
    }

    const depto = { nombre, ...(codigo ? { codigo } : {}) };
    area.departamentos.push(depto);
    await guardarConfig(data);

    await registrarHistorial({
      usuario: req.usuario,
      accion: 'departamento_creado',
      detalle: { area_id: id, area_label: area.label, nombre, codigo: codigo || null },
    });

    return res.status(201).json({ mensaje: 'Departamento creado', departamento: depto });
  } catch (err) {
    console.error('crearDepartamento:', err);
    return res.status(500).json({ mensaje: 'Error al crear departamento' });
  }
}

// ── PUT /api/areas/:id/departamentos/:nombre ──────────────────
export async function actualizarDepartamento(req, res) {
  try {
    const id = decodeURIComponent(req.params.id);
    const nombreActual = decodeURIComponent(req.params.nombre);
    const { nombre: nuevoNombre, codigo } = req.body;
    if (!nuevoNombre) return res.status(400).json({ mensaje: 'nombre es requerido' });

    const data = await cargarConfig();
    const area = data.areas.find(a => a.id === id);
    if (!area) return res.status(404).json({ mensaje: `Área "${id}" no encontrada` });

    const depto = area.departamentos.find(d => d.nombre === nombreActual);
    if (!depto) {
      return res.status(404).json({ mensaje: `Departamento "${nombreActual}" no encontrado` });
    }

    const nombreNorm = normalizarNombreDepto(nuevoNombre);
    const codigoNorm = codigo !== undefined ? normalizarCodigoDTN(codigo) : depto.codigo || null;

    if (nombreNorm !== nombreActual && area.departamentos.some(d => d.nombre === nombreNorm)) {
      return res.status(409).json({ mensaje: `Ya existe el departamento "${nombreNorm}" en esta área` });
    }

    if (codigoNorm) {
      const duplicado = data.areas.some(a =>
        a.departamentos.some(d => d.codigo === codigoNorm && d.nombre !== nombreActual)
      );
      if (duplicado) {
        return res.status(409).json({ mensaje: `El código DTN "${codigoNorm}" ya está en uso` });
      }
    }

    const reqs = await contarUsoDepartamento(id, nombreActual);
    const anterior = { nombre: depto.nombre, codigo: depto.codigo || null };

    depto.nombre = nombreNorm;
    if (codigo !== undefined) {
      if (codigoNorm) depto.codigo = codigoNorm;
      else delete depto.codigo;
    }

    await guardarConfig(data);

    await registrarHistorial({
      usuario: req.usuario,
      accion: 'departamento_actualizado',
      detalle: {
        area_id: id,
        anterior,
        nuevo: { nombre: depto.nombre, codigo: depto.codigo || null },
        requerimientos_historicos: reqs,
      },
    });

    return res.json({
      mensaje: 'Departamento actualizado',
      departamento: depto,
      requerimientos_historicos: reqs,
    });
  } catch (err) {
    console.error('actualizarDepartamento:', err);
    return res.status(500).json({ mensaje: 'Error al actualizar departamento' });
  }
}

// ── DELETE /api/areas/:id/departamentos/:nombre ───────────────
export async function eliminarDepartamento(req, res) {
  try {
    const id = decodeURIComponent(req.params.id);
    const nombre = decodeURIComponent(req.params.nombre);

    const data = await cargarConfig();
    const area = data.areas.find(a => a.id === id);
    if (!area) return res.status(404).json({ mensaje: `Área "${id}" no encontrada` });

    const idx = area.departamentos.findIndex(d => d.nombre === nombre);
    if (idx === -1) {
      return res.status(404).json({ mensaje: `Departamento "${nombre}" no encontrado` });
    }

    const depto = area.departamentos[idx];
    const reqs = await contarUsoDepartamento(id, nombre);

    area.departamentos.splice(idx, 1);
    await guardarConfig(data);

    await registrarHistorial({
      usuario: req.usuario,
      accion: 'departamento_eliminado',
      detalle: {
        area_id: id,
        area_label: area.label,
        nombre: depto.nombre,
        codigo: depto.codigo || null,
        requerimientos_historicos: reqs,
      },
    });

    return res.json({
      mensaje: 'Departamento eliminado',
      requerimientos_historicos: reqs,
    });
  } catch (err) {
    console.error('eliminarDepartamento:', err);
    return res.status(500).json({ mensaje: 'Error al eliminar departamento' });
  }
}