import { enviarCorreo } from '../config/mailer.js';
import * as Requerimiento from '../models/requerimientos.js';
import * as Cotizacion from '../models/cotizaciones.js';

/**
 * Envía correo al proveedor SOLICITANDO una cotización.
 * Se dispara automáticamente al crear el registro de cotización para ese proveedor.
 * Este es el correo principal de "petición de cotización" (RFQ).
 */
export async function enviarSolicitudDeCotizacion(cotizacionId) {
  try {
    const cot = await Cotizacion.obtenerPorId(cotizacionId);
    if (!cot || !cot.proveedor_email) {
      console.warn('[Email] No se puede enviar solicitud: el proveedor no tiene email registrado');
      return { success: false, reason: 'sin_email' };
    }

    const req = await Requerimiento.obtenerPorId(cot.requerimiento_id);
    if (!req) {
      console.warn('[Email] No se encontró el requerimiento asociado');
      return { success: false, reason: 'sin_requerimiento' };
    }

    const fechaLimite = cot.fecha_envio 
      ? new Date(cot.fecha_envio).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : null;

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 640px; margin: 0 auto; background:#f8fafc; padding: 24px;">
        <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 10px rgba(0,0,0,0.06);">
          
          <h2 style="color: #1e3a8a; margin: 0 0 8px; font-size: 22px;">Solicitud de Cotización</h2>
          <p style="color: #475569; font-size: 15px; margin-bottom: 20px;">
            Estimado(a) <strong>${cot.proveedor_nombre || 'Proveedor'}</strong>,
          </p>

          <p style="color: #334155; font-size: 15px; line-height: 1.55;">
            Por medio de la presente, le solicitamos amablemente su <strong>cotización</strong> para el siguiente requerimiento:
          </p>

          <!-- Datos del requerimiento -->
          <div style="background: #f1f5f9; border-radius: 6px; padding: 18px; margin: 20px 0;">
            <table style="width:100%; font-size:14px; color:#1e293b;">
              <tr>
                <td style="padding:4px 0; width:140px;"><strong>Requerimiento:</strong></td>
                <td style="padding:4px 0;"><strong>${req.consecutivo || 'REQ-' + req.id}</strong></td>
              </tr>
              <tr>
                <td style="padding:4px 0;"><strong>Título:</strong></td>
                <td style="padding:4px 0;">${req.titulo_solicitud || '—'}</td>
              </tr>
              <tr>
                <td style="padding:4px 0; vertical-align:top;"><strong>Descripción:</strong></td>
                <td style="padding:4px 0; white-space:pre-line;">${req.descripcion || '—'}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;"><strong>Tipo:</strong></td>
                <td style="padding:4px 0;">${req.tipo || '—'}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;"><strong>Área / Depto:</strong></td>
                <td style="padding:4px 0;">${req.area || ''} ${req.departamento ? ' / ' + req.departamento : ''}</td>
              </tr>
              ${fechaLimite ? `
              <tr>
                <td style="padding:4px 0;"><strong>Fecha deseada de envío:</strong></td>
                <td style="padding:4px 0; color:#b45309;"><strong>${fechaLimite}</strong></td>
              </tr>` : ''}
            </table>
          </div>

          <p style="color: #334155; font-size: 15px; line-height: 1.55;">
            Favor de enviarnos su mejor propuesta a la brevedad posible. Puede responder directamente a este correo 
            adjuntando su cotización en formato PDF o Excel, o proporcionarnos los datos para capturarla en nuestro sistema.
          </p>

          <p style="color: #334155; font-size: 15px;">
            Quedamos atentos a sus comentarios y a su cotización.
          </p>

          <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
            Atentamente,<br>
            <strong>Equipo de Compras</strong><br>
            Sistema de Órdenes de Compra
          </div>

        </div>
        
        <p style="text-align:center; color:#94a3b8; font-size:11px; margin-top:16px;">
          Este es un correo automático generado por el Sistema de Órdenes de Compra.
        </p>
      </div>
    `;

    const textoPlano = `Solicitud de Cotización - ${req.consecutivo || 'REQ-' + req.id}
    
Estimado proveedor,

Le solicitamos su cotización para el siguiente requerimiento:

Requerimiento: ${req.consecutivo || 'REQ-' + req.id}
Título: ${req.titulo_solicitud || '—'}
Tipo: ${req.tipo || '—'}
Descripción: ${req.descripcion || '—'}

Por favor responda a este correo con su propuesta.

Gracias.`;

    const result = await enviarCorreo({
      to: cot.proveedor_email,
      subject: `Solicitud de Cotización - ${req.consecutivo || 'Requerimiento ' + req.id}`,
      html,
      text: textoPlano
    });

    return result;
  } catch (err) {
    console.error('[Email] Error enviando solicitud de cotización:', err);
    return { success: false, error: err.message };
  }
}
