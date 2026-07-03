import {
  listarPorOrden,
  crear as _crear,
  obtenerPorId,
  actualizar as _actualizar,
  eliminar as _eliminar,
  resumenItemsOrden,
} from '../models/recepciones.js';
import logger from '../utils/logger.js';

async function listar(req, res) {
  try {
    res.json(await listarPorOrden(req.params.orden_id));
  } catch (err) {
    logger.error('[listar recepciones]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function resumenItems(req, res) {
  try {
    const excluir = req.query.excluir_recepcion_id
      ? parseInt(req.query.excluir_recepcion_id, 10)
      : null;
    res.json(await resumenItemsOrden(req.params.orden_id, {
      excluir_recepcion_id: Number.isFinite(excluir) ? excluir : null,
    }));
  } catch (err) {
    logger.error('[resumen items recepcion]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function crear(req, res) {
  try {
    const { estado, notas, datatextnow_id, items, cerrar_oc } = req.body;

    const estados_validos = ['recibido_parcial', 'recibido_completo'];
    if (estado && !estados_validos.includes(estado)) {
      return res.status(400).json({ mensaje: `Estado inválido. Opciones: ${estados_validos.join(', ')}` });
    }

    const resultado = await _crear(
      {
        orden_compra_id: req.params.orden_id,
        estado,
        notas,
        datatextnow_id,
        items,
        cerrar_oc: !!cerrar_oc,
      },
      req.usuario.id
    );
    const recepcion = await obtenerPorId(resultado.id);
    res.status(201).json({
      ...recepcion,
      oc_cerrada: resultado.cerrada,
      pendiente_po: resultado.pendientePo,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
    logger.error('[crear recepcion]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function actualizar(req, res) {
  try {
    const actualizado = await _actualizar(req.params.id, req.body, req.usuario.id);
    res.json(actualizado);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
    logger.error('[actualizar recepcion]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function eliminar(req, res) {
  try {
    const afectados = await _eliminar(req.params.id);
    if (!afectados) return res.status(404).json({ mensaje: 'Recepción no encontrada' });
    res.status(204).send();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
    logger.error('[eliminar recepcion]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export { listar, resumenItems, crear, actualizar, eliminar };