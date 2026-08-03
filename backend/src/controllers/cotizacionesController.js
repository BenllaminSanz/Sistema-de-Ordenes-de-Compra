import * as Cotizacion from '../models/cotizaciones.js';
import { registrarHistorial, registrarNotaSeguimientoReq } from '../models/historialEstados.js';
import { enviarSolicitudDeCotizacion } from '../utils/emailService.js';
import fs from 'fs';
import logger from '../utils/logger.js';

function formatearFechaNota(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const dd = String(x.getDate()).padStart(2, '0');
  const mm = String(x.getMonth() + 1).padStart(2, '0');
  const yyyy = x.getFullYear();
  const hh = String(x.getHours()).padStart(2, '0');
  const mi = String(x.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

/** Nota visible en el REQ: cotización enviada al proveedor con fecha. */
async function anotarEnvioCotizacionEnReq(cotizacionId, usuarioId, { reenvio = false } = {}) {
  try {
    const cot = await Cotizacion.obtenerPorId(cotizacionId);
    if (!cot?.requerimiento_id) return;
    const proveedor = cot.proveedor_nombre
      || (cot.proveedor_num ? `Prov. ${cot.proveedor_num}` : 'proveedor');
    const cuando = formatearFechaNota(cot.email_sent_at || new Date());
    const accion = reenvio ? 'Cotización reenviada' : 'Cotización enviada';
    const notas = `${accion} al proveedor ${proveedor} por correo el ${cuando}.`;
    await registrarNotaSeguimientoReq({
      requerimientoId: cot.requerimiento_id,
      usuarioId: usuarioId || 1,
      notas,
    });
  } catch (err) {
    logger.warn('[Cotizacion] No se pudo anotar envío en REQ:', err.message);
  }
}

// Función para enviar cotizaciones pendientes de forma oportunista
async function enviarCotizacionesPendientesOportunista() {
  try {
    const pendientes = await Cotizacion.listarPendientesDeEnvio();

    if (pendientes.length === 0) return;

    logger.info(`[Email] Enviando ${pendientes.length} cotizaciones pendientes...`);

    for (const cot of pendientes) {
      try {
        const idioma = (cot.idioma_correo || 'es').toString().toLowerCase().startsWith('en') ? 'en' : 'es';
        const result = await enviarSolicitudDeCotizacion(cot.id, { idioma });
        if (result.success) {
          await Cotizacion.marcarComoEnviadaPorCorreo(cot.id);
          await anotarEnvioCotizacionEnReq(cot.id, 1, { reenvio: false });
          logger.info(`[Email] Cotización #${cot.id} enviada (programada, idioma=${idioma})`);
        } else if (result.reason === 'no_requiere_segun_condicion') {
          // Regla de negocio: no corresponde enviar correo para este tipo de requerimiento
          await Cotizacion.marcarComoProcesadaSinEnvioCorreo(cot.id);
          logger.info(`[Email] Cotización #${cot.id} procesada sin envío (regla: solo servicios o libres/actualizar precios).`);
        }
      } catch (err) {
        logger.error(`[Email] Error enviando cotización pendiente #${cot.id}:`, err.message);
      }
    }
  } catch (error) {
    logger.error('[Email] Error en envío oportunista de cotizaciones:', error.message);
  }
}

// Valida la fecha de envío (permite pasadas y futuras)
function validarFechaEnvio(fechaEnvio) {
  if (!fechaEnvio) {
    return { valido: true };
  }
  // Solo validamos que sea una fecha válida
  const fecha = new Date(fechaEnvio);
  if (isNaN(fecha.getTime())) {
    return { 
      valido: false, 
      mensaje: 'La fecha de envío no es válida' 
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
    logger.error('Error al listar cotizaciones:', error);
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
    logger.error('Error al obtener cotización:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la cotización'
    });
  }
};

// Crear nueva cotización
export const crearCotizacion = async (req, res) => {
  try {
    const { 
      requerimiento_id, 
      proveedor_id, 
      monto_total, 
      monto_subtotal, 
      iva, 
      moneda, 
      archivo_url, 
      fecha_envio, 
      scheduled_at,   // Nueva forma recomendada (datetime completo)
      hora_envio,     // Alternativa: fecha_envio + hora_envio
      notas,
      idioma_correo,
      items,
      // Solo registrar (cotización ya recibida / compra en tienda): no manda RFQ
      omitir_envio_correo,
      solo_registro,
    } = req.body;

    if (!requerimiento_id || !proveedor_id) {
      return res.status(400).json({ mensaje: 'requerimiento_id y proveedor_id son obligatorios' });
    }

    const idioma = (idioma_correo || 'es').toString().toLowerCase().startsWith('en') ? 'en' : 'es';
    const soloRegistro = omitir_envio_correo === true
      || omitir_envio_correo === 1
      || omitir_envio_correo === '1'
      || omitir_envio_correo === 'true'
      || solo_registro === true
      || solo_registro === 1
      || solo_registro === '1'
      || solo_registro === 'true';

    // Validación básica de fecha
    const validacionFecha = validarFechaEnvio(fecha_envio);
    if (!validacionFecha.valido) {
      return res.status(400).json({ 
        success: false, 
        mensaje: validacionFecha.mensaje 
      });
    }

    const ahora = new Date();
    const hoySinHora = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

    const parseFechaSolo = (fechaStr) => {
      const parte = String(fechaStr).split('T')[0];
      const [y, m, d] = parte.split('-').map(Number);
      return new Date(y, m - 1, d);
    };

    const fechaEnvioSolo = fecha_envio ? parseFechaSolo(fecha_envio) : hoySinHora;
    const esFechaAnterior = fechaEnvioSolo < hoySinHora;
    const esFechaFutura   = fechaEnvioSolo > hoySinHora;
    const esHoy           = !esFechaAnterior && !esFechaFutura;

    // Calcular scheduled_at (solo si se va a programar envío real)
    let finalScheduledAt = null;
    if (!soloRegistro) {
      finalScheduledAt = scheduled_at || null;
      if (!finalScheduledAt && fecha_envio && hora_envio) {
        finalScheduledAt = `${fecha_envio} ${hora_envio}:00`;
      } else if (!finalScheduledAt && fecha_envio && esFechaFutura) {
        finalScheduledAt = `${fecha_envio} 09:00:00`;
      }
    }

    const scheduledDate = finalScheduledAt ? new Date(finalScheduledAt) : null;

    let emailSentAtOnCreate = null;
    let estadoInicial = 'en_revision';

    // Fecha pasada: se asume cotización ya gestionada (sin RFQ nuevo).
    // Solo registro (omitir_envio): no marca "enviado"; solo no manda correo ni programa envío.
    if (esFechaAnterior && !soloRegistro) {
      emailSentAtOnCreate = new Date();
      estadoInicial = 'enviada';
    }

    const round2 = (n) => Math.round( (parseFloat(n) || 0) * 100 ) / 100;
    const id = await Cotizacion.crear({
      requerimiento_id: parseInt(requerimiento_id),
      proveedor_id: parseInt(proveedor_id),
      monto_total: round2(monto_total || 0),
      monto_subtotal: round2(monto_subtotal || 0),
      iva: round2(iva || 0),
      archivo_url: archivo_url || null,
      fecha_envio: fecha_envio || null,
      scheduled_at: finalScheduledAt,
      email_sent_at: emailSentAtOnCreate,
      idioma_correo: idioma,
      notas: notas || null,
      estado: estadoInicial
    }, items || []);

    // Registrar historial de cotización + nota de seguimiento en el REQ
    const notaCreacion = soloRegistro
      ? 'Cotización registrada sin envío de correo'
      : (esFechaAnterior ? 'Cotización registrada (fecha anterior, sin RFQ nuevo)' : 'Cotización creada');
    await registrarHistorial({
      entidad_tipo: 'cotizacion',
      entidad_id: id,
      estado_anterior: null,
      estado_nuevo: estadoInicial,
      cambiado_por: req.usuario?.id || 1,
      notas: notaCreacion,
    });

    let emailEnviado = false;
    let emailOmitido = false;
    let emailError = null;

    if (soloRegistro || esFechaAnterior) {
      emailOmitido = true;
      const cotTmp = await Cotizacion.obtenerPorId(id);
      const prov = cotTmp?.proveedor_nombre || 'proveedor';
      await registrarNotaSeguimientoReq({
        requerimientoId: parseInt(requerimiento_id, 10),
        usuarioId: req.usuario?.id || 1,
        notas: soloRegistro
          ? `Cotización registrada (sin correo) con ${prov} el ${formatearFechaNota()}.`
          : `Cotización registrada con ${prov} el ${formatearFechaNota()} (sin envío de RFQ).`,
      });
      logger.info(
        `[Cotizacion] Cotización #${id} registrada sin envío de correo`
        + (soloRegistro ? ' (solo_registro)' : ' (fecha anterior)')
      );
    } else if (esHoy) {
      const programadoMasTardeHoy = scheduledDate && scheduledDate > ahora;
      if (!programadoMasTardeHoy) {
        try {
          const result = await enviarSolicitudDeCotizacion(id, { idioma });
          if (result.success) {
            await Cotizacion.marcarComoEnviadaPorCorreo(id);
            await anotarEnvioCotizacionEnReq(id, req.usuario?.id, { reenvio: false });
            emailEnviado = true;
            logger.info(`[Email] Solicitud de cotización enviada inmediatamente (cotización #${id}, idioma=${idioma})`);
          } else if (result.reason === 'no_requiere_segun_condicion') {
            await Cotizacion.marcarComoProcesadaSinEnvioCorreo(id);
            emailOmitido = true;
            logger.info(`[Email] Cotización #${id} creada pero NO se envió correo (regla de tipo/catálogo/precios).`);
          } else {
            emailError = result.error || result.reason || 'No se pudo enviar el correo';
            logger.warn(`[Email] Cotización #${id} no enviada al crear: ${emailError}`);
          }
        } catch (err) {
          emailError = err.message || 'Error al enviar el correo';
          logger.error(`[Email] Error enviando solicitud de cotización #${id}:`, emailError);
        }
      } else {
        await registrarNotaSeguimientoReq({
          requerimientoId: parseInt(requerimiento_id, 10),
          usuarioId: req.usuario?.id || 1,
          notas: `Cotización programada para envío el ${formatearFechaNota(scheduledDate || finalScheduledAt)}.`,
        });
        logger.info(`[Cotizacion] Cotización #${id} programada para hoy a las ${finalScheduledAt} (idioma=${idioma})`);
      }
    } else {
      await registrarNotaSeguimientoReq({
        requerimientoId: parseInt(requerimiento_id, 10),
        usuarioId: req.usuario?.id || 1,
        notas: `Cotización programada para envío el ${formatearFechaNota(scheduledDate || finalScheduledAt)}.`,
      });
      logger.info(`[Cotizacion] Cotización #${id} programada para ${finalScheduledAt} (idioma=${idioma})`);
    }

    // Intentar enviar otras cotizaciones pendientes (envío oportunista)
    // No bloquear la respuesta: se ejecuta en segundo plano
    enviarCotizacionesPendientesOportunista().catch(err => {
      logger.error('[Email] Error enviando cotizaciones pendientes:', err.message);
    });

    const esTimeoutRed = emailError && /ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|ENOTFOUND|timeout/i.test(emailError);
    res.status(201).json({
      success: true,
      message: 'Cotización creada exitosamente',
      id,
      scheduled_at: finalScheduledAt,
      email_enviado: emailEnviado,
      email_omitido: emailOmitido,
      email_error: emailError || null,
      email_error_red: esTimeoutRed || false,
    });

  } catch (error) {
    logger.error('[crearCotizacion] Error:', error);
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

    // Validación de fecha de envío (permite pasadas, hoy y futuras, consistente con creación)
    if (datos.fecha_envio !== undefined) {
      const validacionFecha = validarFechaEnvio(datos.fecha_envio);
      if (!validacionFecha.valido) {
        return res.status(400).json({ 
          success: false, 
          mensaje: validacionFecha.mensaje 
        });
      }
    }

    // Redondear montos y precios a 2 decimales, cantidades a enteros (si vienen en datos)
    const round2 = (n) => Math.round( (parseFloat(n) || 0) * 100 ) / 100;
    if (datos.monto_total !== undefined) datos.monto_total = round2(datos.monto_total);
    if (datos.monto_subtotal !== undefined) datos.monto_subtotal = round2(datos.monto_subtotal);
    if (datos.iva !== undefined) datos.iva = round2(datos.iva);
    if (Array.isArray(datos.items)) {
      datos.items = datos.items.map(it => {
        if (it) {
          it.cantidad = Math.max(1, Math.round( parseFloat(it.cantidad) || 1 ));
          if (it.precio_unitario !== undefined) it.precio_unitario = round2(it.precio_unitario);
        }
        return it;
      });
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
    logger.error('Error al actualizar cotización:', error);
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

      const cotSel = await Cotizacion.obtenerPorId(id);
      const provSel = cotSel?.proveedor_nombre || 'proveedor';
      await registrarNotaSeguimientoReq({
        requerimientoId: parseInt(requerimiento_id, 10),
        usuarioId: req.usuario?.id || 1,
        notas: `Cotización de ${provSel} seleccionada el ${formatearFechaNota()}.`,
      });

      res.json({
        success: true,
        message: 'Cotización seleccionada correctamente. Las demás han sido rechazadas. Los ítems libres se formalizarán en el catálogo (con el precio acordado y el proveedor seleccionado) al generar la OC.'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'No se pudo seleccionar la cotización'
      });
    }
  } catch (error) {
    logger.error('Error al seleccionar cotización:', error);
    res.status(500).json({
      success: false,
      message: 'Error al seleccionar la cotización'
    });
  }
};

// Deseleccionar una cotización (nueva funcionalidad)
export const deseleccionarCotizacion = async (req, res) => {
  try {
    const { id } = req.params;
    const { requerimiento_id } = req.body;

    if (!requerimiento_id) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere el requerimiento_id'
      });
    }

    const exito = await Cotizacion.deseleccionar(id, requerimiento_id);

    if (exito) {
      await registrarHistorial({
        entidad_tipo: 'cotizacion',
        entidad_id: id,
        estado_anterior: 'seleccionada',
        estado_nuevo: 'enviada',
        cambiado_por: req.usuario?.id || 1,
        notas: 'Cotización deseleccionada por el usuario'
      });

      res.json({
        success: true,
        message: 'La cotización ha sido deseleccionada correctamente.'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'No se pudo deseleccionar la cotización (¿ya no estaba seleccionada?)'
      });
    }
  } catch (error) {
    logger.error('Error al deseleccionar cotización:', error);
    res.status(500).json({
      success: false,
      message: 'Error al deseleccionar la cotización'
    });
  }
};

// Subir archivo de respaldo a una cotización (PDF, Word, Excel, imágenes, etc.)
export const subirArchivoCotizacion = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se recibió ningún archivo'
      });
    }

    const archivoUrl = `/uploads/cotizaciones/${req.file.filename}`;

    const affected = await Cotizacion.actualizar(id, { archivo_url: archivoUrl });

    if (affected === 0) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({
        success: false,
        message: 'No se pudo guardar el archivo (la cotización podría no existir).'
      });
    }

    res.json({
      success: true,
      message: 'Archivo subido correctamente',
      archivo_url: archivoUrl,
      nombre_original: req.file.originalname || null,
    });
  } catch (error) {
    logger.error('Error al subir archivo de cotización:', error);

    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }

    if (error.message && error.message.includes('Solo se permiten')) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(500).json({
      success: false,
      message: 'Error al subir el archivo'
    });
  }
};

// Exportamos la función para poder llamarla desde otros lugares (ej: login)
export { enviarCotizacionesPendientesOportunista };

/**
 * Envía (o re-envía) el correo de solicitud de cotización para una cotización existente.
 * Usado por el botón manual "Enviar correo" en la UI.
 * Respeta la regla de negocio dentro de enviarSolicitudDeCotizacion.
 */
export const enviarCorreoCotizacion = async (req, res) => {
  try {
    const { id } = req.params;
    const cotId = parseInt(id, 10);
    // Idioma del cuerpo del correo: es | en (default es)
    const idiomaRaw = (req.body?.idioma || req.query?.idioma || 'es').toString().toLowerCase();
    const idioma = idiomaRaw.startsWith('en') ? 'en' : 'es';

    if (!cotId) {
      return res.status(400).json({ success: false, mensaje: 'ID de cotización inválido' });
    }

    const result = await enviarSolicitudDeCotizacion(cotId, { idioma });

    if (result.success) {
      const cotPrev = await Cotizacion.obtenerPorId(cotId);
      const yaEnviada = !!(cotPrev?.email_sent_at);
      await Cotizacion.marcarComoEnviadaPorCorreo(cotId);
      await anotarEnvioCotizacionEnReq(cotId, req.usuario?.id, { reenvio: yaEnviada });
      return res.json({
        success: true,
        message: 'Solicitud de cotización enviada al proveedor',
        idioma,
      });
    } else if (result.reason === 'no_requiere_segun_condicion') {
      return res.status(400).json({
        success: false,
        mensaje: 'Esta cotización no corresponde a un requerimiento que requiera envío de correo (ítems de catálogo para tipos que no son SERVICIOS).'
      });
    } else {
      return res.status(400).json({
        success: false,
        mensaje: result.reason || 'No se pudo enviar la solicitud de cotización'
      });
    }
  } catch (error) {
    logger.error('[enviarCorreoCotizacion] Error:', error);
    res.status(500).json({ success: false, mensaje: 'Error interno al enviar el correo' });
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
    logger.error('Error al eliminar cotización:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la cotización'
    });
  }
};