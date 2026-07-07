import { enviarCorreo } from '../config/mailer.js';
import { obtenerCcCotizaciones } from '../models/configSmtp.js';
import * as Requerimiento from '../models/requerimientos.js';
import * as Cotizacion from '../models/cotizaciones.js';
import {
  EMPRESA_SUBTITULO,
  buildEmailBrandingHtml,
  getEmailBrandingAttachments,
} from './emailBranding.js';

const UNIDADES_ENTERAS = new Set([
  'pieza', 'piezas', 'pza', 'pzas', 'hora', 'horas', 'hr', 'hrs',
  'servicio', 'servicios', 'lote', 'lotes', 'unidad', 'unidades',
]);

function formatCantidadEmail(cantidad, unidad = '') {
  const n = parseFloat(cantidad);
  if (!Number.isFinite(n)) return '1';

  const u = (unidad || '').toLowerCase().trim();
  const esEntera = UNIDADES_ENTERAS.has(u) || Math.abs(n - Math.round(n)) < 0.0001;

  if (esEntera) return String(Math.round(n));

  const redondeada = Math.round(n * 100) / 100;
  return String(redondeada);
}

/**
 * Envía correo al proveedor SOLICITANDO una cotización (RFQ).
 * 
 * Importante: el correo lista únicamente los ítems (descripción, cantidad, unidad).
 * NO incluye precios propuestos por nosotros. Los proveedores responden con sus precios,
 * y luego los registramos/editamos en la cotización.
 * Si la cotización tiene notas, se incluyen como mensaje personalizado para el proveedor.
 * 
 * Se usa principalmente para ítems libres (no en catálogo) o servicios.
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

    // Regla de envío de email para cotizaciones:
    // - SERVICIOS o con items_libres: sí se envía.
    // - Catálogo puro (no servicio): no se envía (solo registro interno).
    const tipo = (req.tipo || '').toUpperCase();
    const esServicio = tipo === 'SERVICIOS';
    const tieneLibres = Array.isArray(req.items_libres) && req.items_libres.length > 0;

    if (!esServicio && !tieneLibres) {
      console.log(`[Email] Cotización #${cotizacionId} — NO se envía (requerimiento con ítems de catálogo y no es de tipo SERVICIOS).`);
      return { success: false, reason: 'no_requiere_segun_condicion' };
    }

    // Continuar con envío para SERVICIOS o cuando hay ítems libres

    const fechaLimite = cot.fecha_envio 
      ? new Date(cot.fecha_envio).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : null;

    // Preparar lista de conceptos a cotizar (sin precios, ya que los provee el proveedor)
    const tieneItems = cot.items && cot.items.length > 0;
    let conceptosHtml = '';

    if (tieneItems) {
      conceptosHtml = `
        <ul style="margin:8px 0 0 20px; padding-left:0; color:#334155; font-size:14px; line-height:1.5;">
          ${cot.items.map(item => {
            const qty = formatCantidadEmail(item.cantidad, item.unidad);
            const unit = item.unidad ? ` ${item.unidad}` : '';
            const qtyNum = parseFloat(item.cantidad) || 1;
            return `<li style="margin-bottom:4px;"><strong>${item.descripcion}</strong>${qtyNum > 1 || unit ? ` — ${qty}${unit}` : ''}</li>`;
          }).join('')}
        </ul>
      `;
    }

    const notasCotizacion = (cot.notas || '').trim();
    const notasHtml = notasCotizacion
      ? `<p style="color: #334155; font-size: 15px; line-height: 1.55; margin-top: 16px; white-space: pre-line;">${notasCotizacion}</p>`
      : '';

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 640px; margin: 0 auto; background:#f8fafc; padding: 24px;">
        <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 10px rgba(0,0,0,0.06);">
          ${buildEmailBrandingHtml()}
          <h2 style="color: #1e3a8a; margin: 0 0 8px; font-size: 22px;">Solicitud de Cotización</h2>
          <!-- Cuerpo simple estilo cliente: solo pedir los items -->
          <p style="color: #334155; font-size: 15px; margin: 16px 0 8px;">
            Buenas tardes <strong>${cot.proveedor_num ? `${cot.proveedor_num} — ` : ''}${cot.proveedor_nombre || 'Proveedor'}</strong>,
          </p>

          <p style="color: #334155; font-size: 15px; line-height: 1.55; margin-bottom: 8px;">
            Por favor su ayuda para cotizar lo siguiente
          </p>

          ${conceptosHtml || '<p style="margin:0; color:#334155;">- (sin conceptos detallados)</p>'}

          ${notasHtml}

          <p style="color: #334155; font-size: 15px; margin-top: 20px;">
            Saludos
          </p>

          <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
            Atentamente,<br>
            <strong>Equipo de Compras</strong><br>
            ${EMPRESA_SUBTITULO}
          </div>

          <!-- Datos del requerimiento -->
          <div style="background: #f1f5f9; border-radius: 6px; padding: 18px; margin: 20px 0;">
            <table style="width:100%; font-size:14px; color:#1e293b;">
              <tr>
                <td style="padding:4px 0; width:140px;"><strong>Requerimiento:</strong></td>
                <td style="padding:4px 0;"><strong>${req.consecutivo || req.id}</strong></td>
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
            </table>
          </div>
        </div>
        
        <p style="text-align:center; color:#94a3b8; font-size:11px; margin-top:16px;">
          Este es un correo automático generado por el Sistema de Órdenes de Compra.
        </p>
      </div>
    `;

    // Texto plano simple (estilo del ejemplo del cliente)
    let itemsTextoPlano = '';
    if (tieneItems) {
      itemsTextoPlano = '\n' + cot.items.map(item => {
        const qty = formatCantidadEmail(item.cantidad, item.unidad);
        const unit = item.unidad ? ` ${item.unidad}` : '';
        const qtyNum = parseFloat(item.cantidad) || 1;
        const detalle = qtyNum > 1 || unit ? ` — ${qty}${unit}` : '';
        return `${item.descripcion}${detalle}`;
      }).join('\n\n');
    }

    const proveedorNombre = cot.proveedor_num
      ? `${cot.proveedor_num} — ${cot.proveedor_nombre || 'Proveedor'}`
      : (cot.proveedor_nombre || 'Proveedor');

    const notasTextoPlano = notasCotizacion ? `\n\n${notasCotizacion}` : '';

    const textoPlano = `Buenas tardes ${proveedorNombre}

Por favor su ayuda para cotizar lo siguiente

${itemsTextoPlano}${notasTextoPlano}

Saludos`;

    const ccCotizaciones = await obtenerCcCotizaciones();
    if (ccCotizaciones) {
      console.log(`[Email] Cotización #${cotizacionId} — CC / Reply-To: ${ccCotizaciones}`);
    }

    const result = await enviarCorreo({
      to: cot.proveedor_email,
      cc: ccCotizaciones || undefined,
      replyTo: ccCotizaciones || undefined,
      subject: `Solicitud de Cotización - ${req.consecutivo || 'Requerimiento ' + req.id}`,
      html,
      text: textoPlano,
      attachments: getEmailBrandingAttachments(),
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
        ${buildEmailBrandingHtml()}
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
          ${EMPRESA_SUBTITULO}
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
    text,
    attachments: getEmailBrandingAttachments(),
  });
}
