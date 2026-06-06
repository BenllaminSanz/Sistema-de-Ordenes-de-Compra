import {
  listar as _listar,
  obtenerPorId,
  crear as _crear,
  actualizar as _actualizar,
  cambiarEstado as _cambiarEstado,
  normalizarNumProveedor
} from '../models/proveedores.js';

function validarNumProveedor(valor, requerido = false) {
  if (valor == null || valor === '') {
    return requerido ? 'El número de proveedor es obligatorio' : null;
  }
  const normalizado = normalizarNumProveedor(valor);
  if (!/^\d{5}$/.test(normalizado)) {
    return 'El número de proveedor debe tener exactamente 5 dígitos';
  }
  return null;
}

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
    const { num_proveedor, nombre, email, telefono, rfc, direccion } = req.body;
    if (!nombre || !email) {
      return res.status(400).json({ mensaje: 'Nombre y email son requeridos' });
    }

    const errorNum = validarNumProveedor(num_proveedor, true);
    if (errorNum) return res.status(400).json({ mensaje: errorNum });

    const id = await _crear({ num_proveedor, nombre, email, telefono, rfc, direccion });
    res.status(201).json(await obtenerPorId(id));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const campo = String(err.message || '').includes('num_proveedor')
        ? 'número de proveedor'
        : 'RFC';
      return res.status(409).json({ mensaje: `Ya existe un proveedor con ese ${campo}` });
    }
    console.error('[crear proveedor]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function actualizar(req, res) {
  try {
    if (req.body.num_proveedor !== undefined) {
      const errorNum = validarNumProveedor(req.body.num_proveedor, true);
      if (errorNum) return res.status(400).json({ mensaje: errorNum });
    }

    const afectados = await _actualizar(req.params.id, req.body);
    if (!afectados) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json(await obtenerPorId(req.params.id));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const campo = String(err.message || '').includes('num_proveedor')
        ? 'número de proveedor'
        : 'RFC';
      return res.status(409).json({ mensaje: `Ya existe un proveedor con ese ${campo}` });
    }
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