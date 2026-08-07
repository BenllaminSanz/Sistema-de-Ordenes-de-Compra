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

function textosCotizacion(idioma = 'es') {
  const es = String(idioma || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';

  if (es === 'en') {
    return {
      saludo: 'Dear Supplier:',
      intro: 'We kindly request your quotation for the items described in this requirement.',
      descripcion: 'Requirement description:',
      cantidad: 'Quantity',
      numParte: 'Part No.',
      sinConceptos: '(no detailed items)',
      cierre1: 'We would appreciate receiving your commercial proposal, lead time and any additional information relevant to the service.',
      cierre2: 'We look forward to your reply.',
      firmas: 'Best regards,',
      equipo: 'Purchasing Team',
      footer: 'This is an automated email from the Purchase Order System.',
      subject: (consecutivo) => `Quotation Request - ${consecutivo}`,
    };
  }

  return {
    saludo: 'Estimado proveedor:',
    intro: 'Por medio de la presente, solicitamos de su apoyo para cotizar los conceptos descritos en el presente requerimiento.',
    descripcion: 'Descripción del requerimiento:',
    cantidad: 'Cantidad',
    numParte: 'No. de parte',
    sinConceptos: '(sin conceptos detallados)',
    cierre1: 'Agradeceremos nos comparta su propuesta económica, tiempo de atención y cualquier información adicional relevante para la ejecución del servicio.',
    cierre2: 'Quedamos atentos a sus comentarios.',
    firmas: 'Saludos cordiales,',
    equipo: 'Equipo de Compras',
    footer: 'Este es un correo automático generado por el Sistema de Órdenes de Compra.',
    subject: (consecutivo) => `Solicitud de Cotización - ${consecutivo}`,
  };
}

/**
 * RFQ al proveedor: conceptos (sin precios), No. de parte y notas.
 * Se envía cuando el REQ requiere cotización: SERVICIOS, ítems libres,
 * o PARTES/FLETES sin precio de referencia (flag requiere_cotizacion).
 * @param {number} cotizacionId
 * @param {{ idioma?: 'es'|'en' }} [opts]
 */
export async function enviarSolicitudDeCotizacion(cotizacionId, opts = {}) {
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

    const tieneLibres = Array.isArray(req.items_libres) && req.items_libres.length > 0;
    const requiereCot = !!(req.requiere_cotizacion);
    const partesSinPrecio = Array.isArray(req.items) && req.items.some(
      (i) => i.costo_referencia == null
        || String(i.costo_referencia).trim() === ''
        || !Number.isFinite(Number(i.costo_referencia))
        || Number(i.costo_referencia) === 0
    );

    if (!tieneLibres && !requiereCot && !partesSinPrecio) {
      console.log(`[Email] Cotización #${cotizacionId} — NO se envía (PARTES/FLETES con precio de catálogo; no requiere RFQ).`);
      return { success: false, reason: 'no_requiere_segun_condicion' };
    }

    const t = textosCotizacion(opts.idioma);
    const tieneItems = cot.items && cot.items.length > 0;
    // Si la cotización no trae líneas, usar ítems del REQ (catálogo o libres)
    let items = tieneItems ? cot.items : [];
    if (!items.length) {
      if (Array.isArray(req.items_libres) && req.items_libres.length) {
        items = req.items_libres.map((l) => ({
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          unidad: l.unidad,
          codigo_catalogo: l.codigo_catalogo || l.catalogo_codigo || l.codigo || null,
        }));
      } else if (Array.isArray(req.items) && req.items.length) {
        items = req.items.map((i) => ({
          descripcion: i.descripcion || i.codigo,
          cantidad: i.cantidad,
          unidad: i.unidad,
          codigo_catalogo: i.codigo || null,
        }));
      }
    }

    const conceptosHtml = items.length
      ? items.map(item => {
          const qty = formatCantidadEmail(item.cantidad, item.unidad);
          const unit = item.unidad ? ` ${item.unidad}` : '';
          const numParte = String(
            item.codigo_catalogo || item.codigo || ''
          ).trim();
          const descripcion = String(item.descripcion || '').trim();
          const concepto = numParte
            ? `${numParte}${descripcion ? ` - ${descripcion}` : ''}`
            : (descripcion || '—');
          return `
            <div style="margin:0 0 14px;">
              <p style="margin:0 0 4px; color:#334155; font-size:15px; line-height:1.55;">${concepto}</p>
              <p style="margin:0; color:#334155; font-size:15px;"><strong>${t.cantidad}:</strong> ${qty}${unit}</p>
            </div>`;
        }).join('')
      : `<p style="margin:0 0 14px; color:#334155; font-size:15px;">${t.sinConceptos}</p>`;

    const notasCotizacion = (cot.notas || '').trim();
    const notasHtml = notasCotizacion
      ? `<p style="color:#334155; font-size:15px; line-height:1.55; margin:0 0 16px; white-space:pre-line;">${notasCotizacion}</p>`
      : '';

    const consecutivo = req.consecutivo || req.id;

    // Sin bloque "Datos de referencia:" (pedido de operación)
    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 640px; margin: 0 auto; background:#f8fafc; padding: 24px;">
        <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 10px rgba(0,0,0,0.06);">
          ${buildEmailBrandingHtml()}

          <p style="color:#334155; font-size:15px; margin:0 0 16px;">
            ${t.saludo}
          </p>

          <p style="color:#334155; font-size:15px; line-height:1.55; margin:0 0 20px;">
            ${t.intro}
          </p>

          <p style="color:#1e293b; font-size:15px; font-weight:700; margin:0 0 10px;">
            ${t.descripcion}
          </p>
          ${conceptosHtml}
          ${notasHtml}

          <p style="color:#334155; font-size:15px; line-height:1.55; margin:0 0 12px;">
            ${t.cierre1}
          </p>

          <p style="color:#334155; font-size:15px; line-height:1.55; margin:0 0 20px;">
            ${t.cierre2}
          </p>

          <p style="color:#334155; font-size:15px; margin:0 0 4px;">
            ${t.firmas}
          </p>
          <p style="color:#334155; font-size:15px; margin:0; line-height:1.55;">
            <strong>${t.equipo}</strong><br>
            ${EMPRESA_SUBTITULO}
          </p>
        </div>

        <p style="text-align:center; color:#94a3b8; font-size:11px; margin-top:16px;">
          ${t.footer}
        </p>
      </div>
    `;

    const itemsTextoPlano = items.length
      ? items.map(item => {
          const qty = formatCantidadEmail(item.cantidad, item.unidad);
          const unit = item.unidad ? ` ${item.unidad}` : '';
          const numParte = String(item.codigo_catalogo || item.codigo || '').trim();
          const descripcion = String(item.descripcion || '').trim();
          const concepto = numParte
            ? `${numParte}${descripcion ? ` - ${descripcion}` : ''}`
            : (descripcion || '—');
          return `${concepto}\n${t.cantidad}: ${qty}${unit}`;
        }).join('\n\n')
      : t.sinConceptos;

    const notasTextoPlano = notasCotizacion ? `\n\n${notasCotizacion}` : '';

    const textoPlano = `${t.saludo}

${t.intro}

${t.descripcion}
${itemsTextoPlano}${notasTextoPlano}

${t.cierre1}

${t.cierre2}

${t.firmas}
${t.equipo}
${EMPRESA_SUBTITULO}

${t.footer}`;

    const ccCotizaciones = await obtenerCcCotizaciones();
    if (ccCotizaciones) {
      console.log(`[Email] Cotización #${cotizacionId} — CC / Reply-To: ${ccCotizaciones}`);
    }

    const result = await enviarCorreo({
      to: cot.proveedor_email,
      cc: ccCotizaciones || undefined,
      replyTo: ccCotizaciones || undefined,
      subject: t.subject(consecutivo),
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

/**
 * Notifica a usuarios Compras (y admin) que un REQ entró a revisión.
 * Destinatarios: usuarios activos rol compras/admin con email real
 * + opcional EMAIL_NOTIF_COMPRAS / EMAIL_CC_COTIZACIONES del entorno.
 * No bloquea el flujo si el correo falla.
 */
export async function notificarComprasReqEnRevision(reqData, opts = {}) {
  try {
    const pool = (await import('../config/db.js')).default;
    const [usuarios] = await pool.query(
      `SELECT email, nombre FROM usuarios
       WHERE activo = 1
         AND rol IN ('compras', 'admin')
         AND email IS NOT NULL AND TRIM(email) <> ''
         AND email NOT LIKE '%@import.local'`
    );

    const extras = [
      process.env.EMAIL_NOTIF_COMPRAS,
      process.env.EMAIL_CC_COTIZACIONES,
    ]
      .filter(Boolean)
      .flatMap((s) => String(s).split(/[,;]/).map((x) => x.trim()).filter(Boolean));

    const destinos = new Set();
    for (const u of usuarios || []) {
      if (u.email) destinos.add(String(u.email).toLowerCase());
    }
    for (const e of extras) destinos.add(e.toLowerCase());

    // No reenviar al mismo solicitante si también es admin de prueba
    if (opts.excluirEmail) destinos.delete(String(opts.excluirEmail).toLowerCase());

    if (!destinos.size) {
      console.warn('[Email] notificarComprasReqEnRevision: sin destinatarios');
      return { success: false, reason: 'sin_destinatarios' };
    }

    const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const consecutivo = reqData.consecutivo || `ID ${reqData.id}`;
    const solicitante = reqData.solicitante_nombre || 'Solicitante';
    const titulo = reqData.titulo_solicitud || reqData.notas || '—';
    const tipo = reqData.tipo || '—';
    const link = `${baseUrl}/requerimientos.html?id=${reqData.id}`;
    const linkBandeja = `${baseUrl}/requerimientos.html?estado=en_revision`;

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 620px; margin: 0 auto; background:#f8fafc; padding:24px;">
        <div style="background:white; border-radius:8px; padding:28px; box-shadow:0 2px 10px rgba(0,0,0,0.06);">
          ${buildEmailBrandingHtml()}
          <h2 style="color:#1e40af; margin:0 0 12px; font-size:18px;">Nuevo requerimiento en revisión</h2>
          <p style="color:#334155; font-size:15px; line-height:1.55; margin:0 0 16px;">
            Un solicitante envió un requerimiento a la bandeja de <strong>Compras</strong>.
          </p>
          <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:18px;">
            <tr><td style="padding:6px 0; color:#64748b; width:120px;">N°</td>
                <td style="padding:6px 0; font-weight:700; color:#0f172a;">${consecutivo}</td></tr>
            <tr><td style="padding:6px 0; color:#64748b;">Tipo</td>
                <td style="padding:6px 0; color:#0f172a;">${tipo}</td></tr>
            <tr><td style="padding:6px 0; color:#64748b;">Solicitante</td>
                <td style="padding:6px 0; color:#0f172a;">${solicitante}</td></tr>
            <tr><td style="padding:6px 0; color:#64748b; vertical-align:top;">Detalle</td>
                <td style="padding:6px 0; color:#0f172a;">${String(titulo).slice(0, 280)}</td></tr>
          </table>
          <div style="text-align:center; margin:20px 0;">
            <a href="${link}"
               style="background:#185FA5; color:white; padding:12px 24px; text-decoration:none; border-radius:6px; font-weight:600; display:inline-block;">
              Abrir requerimiento
            </a>
          </div>
          <p style="color:#64748b; font-size:13px; margin:0;">
            Bandeja completa: <a href="${linkBandeja}" style="color:#185FA5;">Requerimientos en revisión</a>
          </p>
          <hr style="border:none; border-top:1px solid #e2e8f0; margin:22px 0;">
          <p style="color:#94a3b8; font-size:12px; text-align:center; margin:0;">${EMPRESA_SUBTITULO}</p>
        </div>
      </div>`;

    const text = `Nuevo requerimiento en revisión

N°: ${consecutivo}
Tipo: ${tipo}
Solicitante: ${solicitante}
Detalle: ${String(titulo).slice(0, 280)}

Abrir: ${link}
Bandeja: ${linkBandeja}
`;

    const toList = [...destinos];
    const result = await enviarCorreo({
      to: toList[0],
      cc: toList.length > 1 ? toList.slice(1).join(',') : undefined,
      subject: `REQ en revisión: ${consecutivo} — ${solicitante}`,
      html,
      text,
      attachments: getEmailBrandingAttachments(),
    });

    console.log(`[Email] Notificación Compras REQ ${consecutivo} → ${toList.join(', ')} success=${!!result?.success}`);
    return result;
  } catch (err) {
    console.error('[Email] notificarComprasReqEnRevision:', err.message);
    return { success: false, error: err.message };
  }
}
