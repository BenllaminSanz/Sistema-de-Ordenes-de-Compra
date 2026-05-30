import * as Cotizacion from '../models/cotizaciones.js';
import { registrarHistorial } from '../models/historialEstados.js';

// Listar cotizaciones de un requerimiento
export const listarCotizaciones = async (req, res) => {
  try {
    const { requerimiento_id } = req.params;
    const cotizaciones = await Cotizacion.listarPorRequerimiento(requerimiento_id);
    
    res.json({
      success: true,
      data: cotizaciones
    });
  } catch (error) {
    console.error('Error al listar cotizaciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las cotizaciones'
    });
  }
};

// Obtener una cotización por ID
export const obtenerCotizacion = async (req, res) => {
  try {
    const { id } = req.params;
    const cotizacion = await Cotizacion.obtenerPorId(id);
    
    if (!cotizacion) {
      return res.status(404).json({
        success: false,
        message: 'Cotización no encontrada'
      });
    }

    res.json({
      success: true,
      data: cotizacion
    });
  } catch (error) {
    console.error('Error al obtener cotización:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la cotización'
    });
  }
};

// Crear nueva cotización
export const crearCotizacion = async (req, res) => {
  try {
    const { requerimiento_id, proveedor_id, monto_total, monto_subtotal, iva, moneda, 
            archivo_url, fecha_envio, notas, items } = req.body;

    if (!requerimiento_id || !proveedor_id) {
      return res.status(400).json({ mensaje: 'requerimiento_id y proveedor_id son obligatorios' });
    }

    const id = await Cotizacion.crear({
      requerimiento_id: parseInt(requerimiento_id),
      proveedor_id: parseInt(proveedor_id),
      monto_total: monto_total || 0,
      monto_subtotal: monto_subtotal || 0,
      iva: iva || 0,
      moneda: moneda || 'MXN',
      archivo_url: archivo_url || null,
      fecha_envio: fecha_envio || null,
      notas: notas || null
    }, items || []);

    // Registrar historial (opcional)
    await registrarHistorial({
      entidad_tipo: 'cotizacion',
      entidad_id: id,
      estado_anterior: null,
      estado_nuevo: 'enviada',
      cambiado_por: req.usuario?.id || 1,
      notas: 'Cotización creada desde el sistema'
    });

    res.status(201).json({
      success: true,
      message: 'Cotización creada exitosamente',
      id
    });

  } catch (error) {
    console.error('[crearCotizacion] Error:', error);
    res.status(500).json({ 
      mensaje: 'Error al crear la cotización',
      error: error.message 
    });
  }
};

// Actualizar cotización
export const actualizarCotizacion = async (req, res) => {
  try {
    const { id } = req.params;
    const datos = req.body;

    const affected = await Cotizacion.actualizar(id, datos);

    if (affected === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo actualizar. La cotización ya está seleccionada o no existe.'
      });
    }

    res.json({
      success: true,
      message: 'Cotización actualizada correctamente'
    });
  } catch (error) {
    console.error('Error al actualizar cotización:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la cotización'
    });
  }
};

// Seleccionar una cotización (Lógica clave mejorada)
export const seleccionarCotizacion = async (req, res) => {
  try {
    const { id } = req.params;
    const { requerimiento_id } = req.body;

    if (!requerimiento_id) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere el requerimiento_id'
      });
    }

    const exito = await Cotizacion.seleccionar(id, requerimiento_id);

    if (exito) {
      // Registrar en historial
      await registrarHistorial({
        entidad_tipo: 'cotizacion',
        entidad_id: id,
        estado_anterior: 'en_revision',
        estado_nuevo: 'seleccionada',
        cambiado_por: req.usuario?.id || 1,
        notas: 'Cotización seleccionada para generar Orden de Compra'
      });

      res.json({
        success: true,
        message: 'Cotización seleccionada correctamente. Las demás han sido rechazadas.'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'No se pudo seleccionar la cotización'
      });
    }
  } catch (error) {
    console.error('Error al seleccionar cotización:', error);
    res.status(500).json({
      success: false,
      message: 'Error al seleccionar la cotización'
    });
  }
};

// Eliminar cotización
export const eliminarCotizacion = async (req, res) => {
  try {
    const { id } = req.params;
    const affected = await Cotizacion.eliminar(id);

    if (affected === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar una cotización ya seleccionada'
      });
    }

    res.json({
      success: true,
      message: 'Cotización eliminada correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar cotización:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la cotización'
    });
  }
};