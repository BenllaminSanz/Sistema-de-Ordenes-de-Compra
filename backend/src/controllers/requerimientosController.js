import { listar as _listar, obtenerPorId, crear as _crear, actualizar as _actualizar, cambiarEstado as _cambiarEstado, eliminar as _eliminar } from '../models/requerimientos.js';
import * as CotizacionModel from '../models/cotizaciones.js';
import logger from '../utils/logger.js';

// ─── GET /requerimientos ──────────────────────────────────────────────────────
async function listar(req, res) {
  try {
    const { titulo_solicitud, estado, area, departamento, tipo, busqueda, pagina, limite } = req.query;

    // Los solicitantes solo ven sus propios requerimientos
    const solicitante_id =
      req.usuario.rol === 'solicitante' ? req.usuario.id : req.query.solicitante_id;

    const resultado = await _listar({
      titulo_solicitud,
      estado,
      area,
      departamento,
      tipo,
      busqueda,
      solicitante_id,
      pagina,
      limite,
    });

    res.json(resultado);
  } catch (err) {
    console.error('[listar requerimientos]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── GET /requerimientos/:id ──────────────────────────────────────────────────
async function obtener(req, res) {
  try {
    const req_ = await obtenerPorId(req.params.id);
    if (!req_) return res.status(404).json({ mensaje: 'Requerimiento no encontrado' });

    // El solicitante solo puede ver el suyo
    if (
      req.usuario.rol === 'solicitante' &&
      req_.solicitante_id !== req.usuario.id
    ) {
      return res.status(403).json({ mensaje: 'Acceso denegado' });
    }

    res.json(req_);
  } catch (err) {
    console.error('[obtener requerimiento]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── POST /requerimientos ─────────────────────────────────────────────────────
async function crear(req, res) {
  try {
    const { titulo_solicitud, tipo, area, departamento, descripcion, requiere_cotizacion } = req.body;

    // Validaciones básicas
    if (!titulo_solicitud || titulo_solicitud.trim().length < 10) {
      return res.status(400).json({ mensaje: 'El titulo debe tener al menos 10 caracteres' });
    }
    if (!descripcion || descripcion.trim().length < 10) {
      return res.status(400).json({ mensaje: 'La descripción debe tener al menos 10 caracteres' });
    }

    const id = await _crear(
      { titulo_solicitud, tipo, area, departamento, descripcion: descripcion.trim(), requiere_cotizacion },
      req.usuario.id
    );

    const nuevo = await obtenerPorId(id);
    res.status(201).json(nuevo);
  } catch (err) {
    logger.error('Error al crear requerimiento', { 
      error: err.message, 
      stack: err.stack,
      userId: req.usuario?.id 
    });
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── PUT /requerimientos/:id ──────────────────────────────────────────────────
async function actualizar(req, res) {
  try {
    const { titulo_solicitud, area, departamento, tipo, descripcion, requiere_cotizacion, datatextnow_id } = req.body;

    // Los solicitantes solo pueden editar sus propios requerimientos
    if (req.usuario.rol === 'solicitante') {
      const reqActual = await obtenerPorId(req.params.id);
      if (!reqActual) {
        return res.status(404).json({ mensaje: 'Requerimiento no encontrado' });
      }
      if (reqActual.solicitante_id !== req.usuario.id) {
        return res.status(403).json({ mensaje: 'No puedes editar requerimientos de otros usuarios' });
      }
    }

    const afectados = await _actualizar(req.params.id, {
      titulo_solicitud: titulo_solicitud?.trim(),
      area,
      departamento,
      tipo,
      descripcion: descripcion?.trim(),
      requiere_cotizacion,
      datatextnow_id,
    });

    if (afectados === 0) {
      return res.status(404).json({
        mensaje: 'Requerimiento no encontrado o su estado no permite edición',
      });
    }

    const actualizado = await obtenerPorId(req.params.id);
    res.json(actualizado);
  } catch (err) {
    console.error('[actualizar requerimiento]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── PATCH /requerimientos/:id/estado ────────────────────────────────────────
async function cambiarEstado(req, res) {
  try {
    // Zod ya comprobo que 'estado' existe y es válido
    const { estado, notas } = req.body;

    // Verificar ownership para solicitantes
    if (req.usuario.rol === 'solicitante') {
      const reqActual = await obtenerPorId(req.params.id);
      if (!reqActual) {
        return res.status(404).json({ mensaje: 'Requerimiento no encontrado' });
      }
      if (reqActual.solicitante_id !== req.usuario.id) {
        return res.status(403).json({ mensaje: 'No puedes cambiar el estado de requerimientos de otros usuarios' });
      }
    }

    // === VALIDACIÓN PARA APROBAR REQUERIMIENTOS QUE NECESITAN COTIZACIÓN ===
    if (estado === 'aprobado') {
      const reqActual = await obtenerPorId(req.params.id);
      if (!reqActual) {
        return res.status(404).json({ mensaje: 'Requerimiento no encontrado' });
      }

      if (reqActual.requiere_cotizacion) {
        const cotizaciones = await CotizacionModel.listarPorRequerimiento(req.params.id);
        const seleccionada = cotizaciones.find(c => 
          c.seleccionada === 1 || c.estado === 'seleccionada'
        );

        if (!seleccionada) {
          return res.status(400).json({ 
            mensaje: 'Este requerimiento requiere cotización. Debes seleccionar una cotización ganadora antes de aprobar.' 
          });
        }

        if (!seleccionada.archivo_url || !seleccionada.archivo_url.trim()) {
          return res.status(400).json({ 
            mensaje: 'Debes adjuntar el PDF de la cotización seleccionada antes de aprobar el requerimiento.' 
          });
        }
      }
    }

    await _cambiarEstado(
      req.params.id,
      estado,
      req.usuario.id,
      notas || null
    );

    const actualizado = await obtenerPorId(req.params.id);
    res.json(actualizado);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
    
    logger.error('Error al cambiar estado de requerimiento', { 
      error: err.message, 
      stack: err.stack,
      requerimientoId: req.params.id,
      userId: req.usuario?.id 
    });
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── DELETE /requerimientos/:id ───────────────────────────────────────────────
async function eliminar(req, res) {
  try {
    const afectados = await _eliminar(req.params.id);

    if (afectados === 0) {
      return res.status(404).json({
        mensaje: 'Requerimiento no encontrado o no se puede eliminar en su estado actual',
      });
    }

    res.status(204).send();
  } catch (err) {
    logger.error('Error al eliminar requerimiento', { 
      error: err.message, 
      stack: err.stack,
      requerimientoId: req.params.id,
      userId: req.usuario?.id 
    });
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export { listar, obtener, crear, actualizar, cambiarEstado, eliminar };