import * as CatalogoModel from '../models/catalogo.js';

async function listar(req, res) {
  try {
    const filtros = {
      tipo: req.query.tipo || null,
      busqueda: req.query.busqueda || null,
      proveedor_id: req.query.proveedor_id ? parseInt(req.query.proveedor_id, 10) : null,
      soloActivos: req.query.soloActivos === 'true'
    };

    const items = await CatalogoModel.listar(filtros);
    res.json(items);
  } catch (err) {
    console.error('[listar catalogo]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function obtener(req, res) {
  try {
    const item = await CatalogoModel.obtenerPorId(req.params.id);
    if (!item) return res.status(404).json({ mensaje: 'Elemento no encontrado en el catálogo' });
    res.json(item);
  } catch (err) {
    console.error('[obtener catalogo]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function crear(req, res) {
  try {
    const { tipo, codigo, descripcion, costo_referencia, proveedor_id } = req.body;

    if (!tipo || !codigo || !descripcion) {
      return res.status(400).json({ mensaje: 'Tipo, código y descripción son obligatorios' });
    }

    const id = await CatalogoModel.crear({
      tipo,
      codigo,
      descripcion,
      costo_referencia,
      proveedor_id
    });

    res.status(201).json(await CatalogoModel.obtenerPorId(id));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe un elemento con ese código en el catálogo' });
    }
    console.error('[crear catalogo]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function actualizar(req, res) {
  try {
    const afectados = await CatalogoModel.actualizar(req.params.id, req.body);
    if (!afectados) return res.status(404).json({ mensaje: 'Elemento no encontrado en el catálogo' });

    res.json(await CatalogoModel.obtenerPorId(req.params.id));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe un elemento con ese código' });
    }
    console.error('[actualizar catalogo]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function cambiarEstado(req, res) {
  try {
    const { activo } = req.body;
    if (activo === undefined) {
      return res.status(400).json({ mensaje: "El campo 'activo' es requerido" });
    }

    const afectados = await CatalogoModel.cambiarEstado(req.params.id, activo);
    if (!afectados) return res.status(404).json({ mensaje: 'Elemento no encontrado en el catálogo' });

    res.json({ 
      mensaje: `Elemento ${activo ? 'activado' : 'desactivado'} correctamente` 
    });
  } catch (err) {
    console.error('[cambiarEstado catalogo]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export { listar, obtener, crear, actualizar, cambiarEstado };