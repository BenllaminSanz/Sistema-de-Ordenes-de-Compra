import { listar as _listar, obtenerPorId, crear as _crear, actualizar as _actualizar, cambiarEstado as _cambiarEstado } from '../models/proveedores.js';

async function listar(req, res) {
  try {
    const soloActivos = req.query.activos === 'true';
    res.json(await _listar(soloActivos));
  } catch (err) {
    console.error('[listar proveedores]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function obtener(req, res) {
  try {
    const p = await obtenerPorId(req.params.id);
    if (!p) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json(p);
  } catch (err) {
    console.error('[obtener proveedor]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function crear(req, res) {
  try {
    const { nombre, email, telefono, rfc, direccion } = req.body;
    if (!nombre || !email) {
      return res.status(400).json({ mensaje: 'Nombre y email son requeridos' });
    }
    const id = await _crear({ nombre, email, telefono, rfc, direccion });
    res.status(201).json(await obtenerPorId(id));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe un proveedor con ese RFC' });
    }
    console.error('[crear proveedor]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function actualizar(req, res) {
  try {
    const afectados = await _actualizar(req.params.id, req.body);
    if (!afectados) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json(await obtenerPorId(req.params.id));
  } catch (err) {
    console.error('[actualizar proveedor]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function cambiarEstado(req, res) {
  try {
    const { activo } = req.body;
    if (activo === undefined) {
      return res.status(400).json({ mensaje: "El campo 'activo' es requerido" });
    }
    const afectados = await _cambiarEstado(req.params.id, activo);
    if (!afectados) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json({ mensaje: `Proveedor ${activo ? 'activado' : 'desactivado'}` });
  } catch (err) {
    console.error('[cambiarEstado proveedor]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export { listar, obtener, crear, actualizar, cambiarEstado };