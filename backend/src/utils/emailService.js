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
    if (!cot) {
      console.warn(`[Email] No se puede enviar solicitud: no existe la cotización #${cotizacionId}`);
      return { success: false, reason: 'cotizacion_no_existe' };
    }

    if (!cot.proveedor_email) {
      console.warn(`[Email] No se puede enviar solicitud: el proveedor de la cotización #${cotizacionId} no tiene email registrado en la tabla de proveedores.`);
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

    // Preparar información del monto y conceptos
    const monto = parseFloat(cot.monto_total || 0).toLocaleString('es-MX');
    const tieneItems = cot.items && cot.items.length > 0;
    let conceptosHtml = '';

    if (tieneItems) {
      conceptosHtml = `
        <p style="margin:12px 0 6px; font-weight:600; color:#1e293b;">Conceptos cotizados:</p>
        <ul style="margin:0; padding-left:20px; color:#334155; font-size:14px;">
          ${cot.items.map(item => {
            const sub = ((item.cantidad || 1) * (item.precio_unitario || 0)).toLocaleString('es-MX');
            return `<li>${item.descripcion} — ${item.cantidad || 1} ${item.unidad || 'pieza'} × $${(item.precio_unitario || 0).toLocaleString('es-MX')} = <strong>$${sub}</strong></li>`;
          }).join('')}
        </ul>
      `;
    }

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
                <td style="padding:4px 0; white-space:pre-line;">${req.notas || req.descripcion || '—'}</td>
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

          <!-- Monto propuesto y conceptos -->
          <div style="background:#ecfdf5; border-radius:6px; padding:14px 18px; margin:16px 0;">
            <p style="margin:0 0 6px; font-size:14px; color:#166534;">
              <strong>Monto propuesto por usted:</strong> 
              <span style="font-size:18px; font-weight:700;">$${monto} ${cot.moneda || 'MXN'}</span>
            </p>
            ${conceptosHtml}
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
Notas: ${req.notas || req.descripcion || '—'}

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

/**
 * Envía correo de verificación de cuenta al nuevo usuario solicitante.
 */
export async function enviarCorreoVerificacion(nombre, email, token) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const link = `${baseUrl}/verificar.html?token=${token}`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 620px; margin: 0 auto; background:#f8fafc; padding:24px;">
      <div style="background:white; border-radius:8px; padding:32px; box-shadow:0 2px 10px rgba(0,0,0,0.06);">
        <h2 style="color:#1e40af; margin:0 0 12px;">Confirma tu cuenta</h2>
        
        <p style="color:#334155; font-size:15px;">Hola <strong>${nombre}</strong>,</p>
        
        <p style="color:#334155; font-size:15px; line-height:1.55;">
          Gracias por registrarte en el <strong>Sistema de Órdenes de Compra</strong>.<br>
          Para activar tu cuenta como solicitante, por favor confirma tu correo electrónico haciendo clic en el siguiente botón:
        </p>

        <div style="text-align:center; margin:28px 0;">
          <a href="${link}" 
             style="background:#185FA5; color:white; padding:14px 32px; text-decoration:none; border-radius:6px; font-weight:600; display:inline-block;">
            Confirmar mi correo electrónico
          </a>
        </div>

        <p style="color:#64748b; font-size:13px;">
          Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
          <a href="${link}" style="color:#185FA5; word-break:break-all;">${link}</a>
        </p>

        <p style="color:#64748b; font-size:13px; margin-top:24px;">
          Este enlace expirará en <strong>24 horas</strong>. Si no solicitaste esta cuenta, puedes ignorar este correo.
        </p>

        <hr style="border:none; border-top:1px solid #e2e8f0; margin:24px 0;">
        <p style="color:#94a3b8; font-size:12px; text-align:center;">
          Sistema de Órdenes de Compra
        </p>
      </div>
    </div>
  `;

  const text = `Hola ${nombre},

Gracias por registrarte en el Sistema de Órdenes de Compra.

Para confirmar tu cuenta, visita el siguiente enlace:
${link}

Este enlace expira en 24 horas.

Si no solicitaste esta cuenta, ignora este correo.`;

  return enviarCorreo({
    to: email,
    subject: 'Confirma tu cuenta - Sistema de Órdenes de Compra',
    html,
    text
  });
}
