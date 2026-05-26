import { listar as _listar, obtenerPorId, crear as _crear, cambiarEstado as _cambiarEstado, actualizarDatatextnow as _actualizarDatatextnow } from '../models/ordenes.js';

async function listar(req, res) {
  try {
    res.json(await _listar(req.query));
  } catch (err) {
    console.error('[listar OC]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function obtener(req, res) {
  try {
    const oc = await obtenerPorId(req.params.id);
    if (!oc) return res.status(404).json({ mensaje: 'Orden de compra no encontrada' });
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
    if (!datatextnow_id) return res.status(400).json({ mensaje: 'datatextnow_id es requerido' });
    await _actualizarDatatextnow(req.params.id, datatextnow_id);
    res.json(await obtenerPorId(req.params.id));
  } catch (err) {
    console.error('[actualizar datatextnow OC]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export { listar, obtener, crear, cambiarEstado, actualizarDatatextnow };