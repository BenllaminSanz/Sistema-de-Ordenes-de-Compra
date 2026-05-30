import { listarPorOrden, crear as _crear, obtenerPorId, marcarEntregado as _marcarEntregado } from '../models/recepciones.js';
import pool from '../config/db.js';

async function listar(req, res) {
  try {
    res.json(await listarPorOrden(req.params.orden_id));
  } catch (err) {
    console.error('[listar recepciones]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function crear(req, res) {
  try {
    const { estado, notas, datatextnow_id } = req.body;

    const estados_validos = ['recibido_parcial','recibido_completo','entregado_solicitante'];
    if (estado && !estados_validos.includes(estado)) {
      return res.status(400).json({ mensaje: `Estado inválido. Opciones: ${estados_validos.join(', ')}` });
    }

    const id = await _crear(
      { orden_compra_id: req.params.orden_id, estado, notas, datatextnow_id },
      req.usuario.id
    );
    res.status(201).json(await obtenerPorId(id));
  } catch (err) {
    console.error('[crear recepcion]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function marcarEntregado(req, res) {
  try {
    // Si es solicitante, verificar que la recepción pertenezca a uno de sus requerimientos
    if (req.usuario.rol === 'solicitante') {
      const rec = await obtenerPorId(req.params.id);
      if (!rec) return res.status(404).json({ mensaje: 'Recepción no encontrada' });

      // Necesitamos obtener el solicitante_id de la OC
      const [[oc]] = await pool.query(  // usamos pool directamente o importamos el modelo de OC
        `SELECT r.solicitante_id 
         FROM ordenes_compra oc 
         JOIN requerimientos r ON r.id = oc.requerimiento_id 
         WHERE oc.id = ?`,
        [rec.orden_compra_id]
      );

      if (!oc || oc.solicitante_id !== req.usuario.id) {
        return res.status(403).json({ mensaje: 'No tienes permiso para confirmar esta recepción' });
      }
    }

    const afectados = await _marcarEntregado(req.params.id, req.usuario.id);
    if (!afectados) return res.status(404).json({ mensaje: 'Recepción no encontrada' });
    res.json(await obtenerPorId(req.params.id));
  } catch (err) {
    console.error('[marcarEntregado]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export { listar, crear, marcarEntregado };