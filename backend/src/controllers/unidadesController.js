import * as Unidades from '../models/unidadesMedida.js';
import logger from '../utils/logger.js';

async function listar(req, res) {
  try {
    const soloActivas = req.query.soloActivas !== 'false';
    res.json(await Unidades.listar({ soloActivas }));
  } catch (err) {
    logger.error('[listar unidades]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function crear(req, res) {
  try {
    const id = await Unidades.crear(req.body || {});
    res.status(201).json(await Unidades.obtenerPorId(id));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe una unidad con ese código' });
    }
    logger.error('[crear unidad]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function actualizar(req, res) {
  try {
    const afectados = await Unidades.actualizar(req.params.id, req.body || {});
    if (!afectados) return res.status(404).json({ mensaje: 'Unidad no encontrada' });
    res.json(await Unidades.obtenerPorId(req.params.id));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe una unidad con ese código' });
    }
    logger.error('[actualizar unidad]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function eliminar(req, res) {
  try {
    const afectados = await Unidades.eliminar(req.params.id);
    if (!afectados) return res.status(404).json({ mensaje: 'Unidad no encontrada' });
    res.json({ mensaje: 'Unidad desactivada' });
  } catch (err) {
    logger.error('[eliminar unidad]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export { listar, crear, actualizar, eliminar };
