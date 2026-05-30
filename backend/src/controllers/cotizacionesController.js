import * as Cotizacion from '../models/cotizaciones.js';
import { registrarHistorial } from '../models/historialEstados.js';
import { enviarSolicitudDeCotizacion } from '../utils/emailService.js';

// Valida que la fecha de envío no sea mayor al día actual
function validarFechaEnvioNoFutura(fechaEnvio) {
  if (!fechaEnvio) return { valido: true };
  
  const fecha = new Date(fechaEnvio);
  // Normalizar a medianoche local para comparar solo fechas
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  fecha.setHours(0, 0, 0, 0);

  if (fecha > hoy) {
    return { 
      valido: false, 
      mensaje: 'La fecha de envío no puede ser mayor al día actual' 
    };
  }
  return { valido: true };
}

// Listar cotizaciones de un requerimiento
export const listarCotizaciones = async (req, res) => {
  try {
    const { requerimiento_id } = req.params;
    // Incluimos items para poder mostrar desglose en la interfaz
    const cotizaciones = await Cotizacion.listarPorRequerimiento(requerimiento_id, true);
    
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

    // Validación: fecha de envío no puede ser futura
    const validacionFecha = validarFechaEnvioNoFutura(fecha_envio);
    if (!validacionFecha.valido) {
      return res.status(400).json({ 
        success: false, 
        mensaje: validacionFecha.mensaje 
      });
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

    // Enviar correo automático al proveedor solicitando la cotización (no bloquea la respuesta)
    enviarSolicitudDeCotizacion(id).then(result => {
      if (result.success) {
        console.log(`[Email] Solicitud de cotización enviada al proveedor (cotización #${id})`);
      }
    }).catch(err => {
      console.error(`[Email] Error enviando solicitud de cotización #${id}:`, err.message);
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

    // Validación: fecha de envío no puede ser futura
    if (datos.fecha_envio !== undefined) {
      const validacionFecha = validarFechaEnvioNoFutura(datos.fecha_envio);
      if (!validacionFecha.valido) {
        return res.status(400).json({ 
          success: false, 
          mensaje: validacionFecha.mensaje 
        });
      }
    }

    const affected = await Cotizacion.actualizar(id, datos, datos.items || null);

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