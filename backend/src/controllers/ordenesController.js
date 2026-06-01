import { listar as _listar, obtenerPorId, crear as _crear, cambiarEstado as _cambiarEstado, actualizarDatatextnow as _actualizarDatatextnow } from '../models/ordenes.js';

async function listar(req, res) {
  try {
    const filtros = { ...req.query };

    // Los solicitantes solo pueden ver sus propias órdenes de compra
    if (req.usuario.rol === 'solicitante') {
      filtros.solicitante_id = req.usuario.id;
      // Evitar que intenten filtrar por otro solicitante
      delete filtros.solicitante_id_from_query; // por si acaso
    }

    res.json(await _listar(filtros));
  } catch (err) {
    console.error('[listar OC]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function obtener(req, res) {
  try {
    const oc = await obtenerPorId(req.params.id);
    if (!oc) return res.status(404).json({ mensaje: 'Orden de compra no encontrada' });

    // Los solicitantes solo pueden ver sus propias OCs
    if (req.usuario.rol === 'solicitante' && oc.solicitante_id !== req.usuario.id) {
      return res.status(403).json({ mensaje: 'No tienes permiso para ver esta orden de compra' });
    }

    res.json(oc);
  } catch (err) {
    console.error('[obtener OC]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function crear(req, res) {
  try {
    const { requerimiento_id, cotizacion_id } = req.body;
    if (!requerimiento_id) {
      return res.status(400).json({ mensaje: 'requerimiento_id es requerido' });
    }
    const id = await _crear(requerimiento_id, cotizacion_id, req.usuario.id);
    res.status(201).json(await obtenerPorId(id));
  } catch (err) {
    console.error('[crear OC]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function cambiarEstado(req, res) {
  try {
    const { estado, notas } = req.body;
    if (!estado) return res.status(400).json({ mensaje: "El campo 'estado' es requerido" });
    await _cambiarEstado(req.params.id, estado, req.usuario.id, notas);
    res.json(await obtenerPorId(req.params.id));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
    console.error('[cambiarEstado OC]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function actualizarDatatextnow(req, res) {
  try {
    const { datatextnow_id } = req.body;
    if (!datatextnow_id) return res.status(400).json({ mensaje: 'datatextnow_id (número de PO de DataTextNow) es requerido' });
    await _actualizarDatatextnow(req.params.id, datatextnow_id);
    res.json(await obtenerPorId(req.params.id));
  } catch (err) {
    console.error('[actualizar datatextnow OC]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export { listar, obtener, crear, cambiarEstado, actualizarDatatextnow };