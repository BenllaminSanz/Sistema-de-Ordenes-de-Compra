import {
  listar as _listar,
  obtenerPorId,
  crear as _crear,
  cambiarEstado as _cambiarEstado,
  actualizarDatatextnow as _actualizarDatatextnow,
  actualizarItemCatalogo as _actualizarItemCatalogo,
  actualizarNotas as _actualizarNotas,
} from '../models/ordenes.js';
import logger from '../utils/logger.js';

async function listar(req, res) {
  try {
    const filtros = { ...req.query };

    // Regla de permisos:
    // - Admin y Contabilidad: pueden ver TODAS las OCs.
    // - Solicitante: SOLO puede ver las OCs que nacen de SUS requerimientos (usando el filtro por solicitante_id del requerimiento asociado).
    if (req.usuario.rol === 'solicitante') {
      // Forzamos el filtro al solicitante actual. Cualquier otro valor que venga en la query se sobrescribe.
      filtros.solicitante_id = req.usuario.id;
    }

    res.json(await _listar(filtros));
  } catch (err) {
    logger.error('[listar OC]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function obtener(req, res) {
  try {
    const oc = await obtenerPorId(req.params.id);
    if (!oc) return res.status(404).json({ mensaje: 'Orden de compra no encontrada' });

    // Los solicitantes solo pueden ver las OCs relacionadas a SUS requerimientos.
    // (Usamos el solicitante_id del requerimiento al que pertenece la OC)
    if (req.usuario.rol === 'solicitante' && oc.solicitante_id !== req.usuario.id) {
      return res.status(403).json({ mensaje: 'No tienes permiso para ver esta orden de compra' });
    }

    res.json(oc);
  } catch (err) {
    logger.error('[obtener OC]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function crear(req, res) {
  try {
    const {
      requerimiento_id,
      cotizacion_id,
      items_codigo_catalogo,
      datatextnow_id,
      fecha_po,
    } = req.body;
    if (!requerimiento_id) {
      return res.status(400).json({ mensaje: 'requerimiento_id es requerido' });
    }

    // Defensa: solo se puede generar OC de requerimientos en estado 'aprobado'
    const { obtenerPorId: obtenerReq } = await import('../models/requerimientos.js');
    const reqData = await obtenerReq(requerimiento_id);
    if (!reqData) {
      return res.status(404).json({ mensaje: 'Requerimiento no encontrado' });
    }
    if (reqData.estado !== 'aprobado') {
      return res.status(422).json({ mensaje: `El requerimiento debe estar en estado 'aprobado' para generar una OC (estado actual: ${reqData.estado})` });
    }
    if (reqData.orden_compra_id) {
      return res.status(422).json({ mensaje: 'Este requerimiento ya tiene una Orden de Compra generada' });
    }
    if (reqData.requiere_cotizacion && !cotizacion_id) {
      return res.status(400).json({ mensaje: 'Este requerimiento requiere cotización. Debes proporcionar cotizacion_id (selecciona una cotización antes de generar la OC).' });
    }

    const notasOC = reqData.notas || null;
    const id = await _crear(
      requerimiento_id,
      cotizacion_id,
      req.usuario.id,
      notasOC,
      items_codigo_catalogo || null,
      { datatextnow_id, fecha_po }
    );
    res.status(201).json(await obtenerPorId(id));
  } catch (err) {
    logger.error('[crear OC]', err);
    if (err.status) {
      return res.status(err.status).json({
        mensaje: err.mensaje || 'Error',
        codigo: err.codigo || undefined,
        items: err.items || undefined,
      });
    }
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
    logger.error('[cambiarEstado OC]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function actualizarDatatextnow(req, res) {
  try {
    const { datatextnow_id, fecha_po } = req.body || {};
    if (datatextnow_id === undefined) {
      return res.status(400).json({ mensaje: 'datatextnow_id (número de PO de DataTextNow o NA) es requerido' });
    }
    const val = (datatextnow_id == null || datatextnow_id === '') ? null : String(datatextnow_id).trim();
    await _actualizarDatatextnow(req.params.id, val, fecha_po);
    res.json(await obtenerPorId(req.params.id));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
    logger.error('[actualizar datatextnow OC]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function actualizarItemCatalogo(req, res) {
  try {
    const { proveedor_id, costo_referencia, unidad } = req.body || {};
    const { id, catalogoId } = req.params;
    const catIdInt = parseInt(catalogoId, 10);
    if (!catIdInt || isNaN(catIdInt)) {
      return res.status(400).json({ mensaje: 'El ítem seleccionado no tiene ID de catálogo válido — solo se pueden editar ítems de catálogo, no ítems libres.' });
    }
    await _actualizarItemCatalogo(id, catIdInt, { proveedor_id, costo_referencia, unidad });
    res.json(await obtenerPorId(id));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
    logger.error('[actualizarItemCatalogo OC]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function actualizarNotas(req, res) {
  try {
    if (req.body?.notas === undefined) {
      return res.status(400).json({ mensaje: 'El campo notas es requerido (puede ser texto vacío)' });
    }
    const afectados = await _actualizarNotas(req.params.id, req.body.notas);
    if (!afectados) {
      return res.status(404).json({ mensaje: 'Orden de compra no encontrada' });
    }
    res.json(await obtenerPorId(req.params.id));
  } catch (err) {
    logger.error('[actualizar notas OC]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export {
  listar,
  obtener,
  crear,
  cambiarEstado,
  actualizarDatatextnow,
  actualizarItemCatalogo,
  actualizarNotas,
};
