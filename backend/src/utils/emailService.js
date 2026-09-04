import { enviarCorreo } from '../config/mailer.js';
import { obtenerCcCotizaciones } from '../models/configSmtp.js';
import {
  obtenerAjustesCorreo,
  frontendUrlEfectiva,
  esLocalhost,
} from '../models/configApp.js';
import * as Requerimiento from '../models/requerimientos.js';
import * as Cotizacion from '../models/cotizaciones.js';
import {
  EMPRESA_SUBTITULO,
  buildEmailBrandingHtml,
  getEmailBrandingAttachments,
} from './emailBranding.js';

/**
 * URL pública para ligas de correo.
 * Prioridad: configuracion_app.frontend_url → FRONTEND_URL / PUBLIC_APP_URL / CORS_ORIGIN.
 */
export async function getPublicAppUrl() {
  try {
    const ajustes = await obtenerAjustesCorreo();
    return frontendUrlEfectiva(ajustes);
  } catch {
    return frontendUrlEfectiva(null);
  }
}

export function isPublicAppUrlLocal(url) {
  return esLocalhost(url || frontendUrlEfectiva(null));
}

const UNIDADES_ENTERAS = new Set([
  'pieza', 'piezas', 'pza', 'pzas', 'hora', 'horas', 'hr', 'hrs',
  'servicio', 'servicios', 'lote', 'lotes', 'unidad', 'unidades',
]);

const ETIQUETA_ESTADO_REQ = {
  en_revision: 'En revisión',
  recibido: 'Recibido',
  incompleto: 'Incompleto',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  cerrado: 'Cerrado',
  borrador: 'Borrador',
};

function etiquetaEstadoReq(estado) {
  const key = String(estado || '').trim().toLowerCase();
  return ETIQUETA_ESTADO_REQ[key] || String(estado || '—').replace(/_/g, ' ');
}

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
  const baseUrl = await getPublicAppUrl();
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
    const ajustes = await obtenerAjustesCorreo();
    if (!ajustes.notif_req_revision) {
      console.log('[Email] Notificación REQ en revisión omitida (desactivada en Configuración)');
      return { success: false, skipped: true, reason: 'notif_desactivada' };
    }

    const { listarDestinatariosNotif } = await import('../models/configApp.js');
    const lista = await listarDestinatariosNotif(ajustes);
    const destinos = new Set(lista.map((d) => d.email));

    // No reenviar al mismo solicitante si también es admin de prueba
    if (opts.excluirEmail) destinos.delete(String(opts.excluirEmail).toLowerCase());

    if (!destinos.size) {
      console.warn('[Email] notificarComprasReqEnRevision: sin destinatarios');
      return { success: false, reason: 'sin_destinatarios' };
    }

    const baseUrl = frontendUrlEfectiva(ajustes);
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

/**
 * Resumen diario a Compras (no se envía a solicitantes).
 * Un envío por día (America/Mexico_City) salvo forzar.
 */
export async function enviarReporteDiarioCompras({
  forzar = false,
  soloDestinatarios = null,
  prueba = false,
} = {}) {
  const {
    listarDestinatariosNotif,
    fechaHoyMexico,
    marcarReporteDiarioEnviado,
    esDiaDeReporteDiario,
  } = await import('../models/configApp.js');
  const ajustes = await obtenerAjustesCorreo();
  const esPrueba = prueba || (Array.isArray(soloDestinatarios) && soloDestinatarios.length > 0);
  if (!esPrueba && !ajustes.reporte_diario) {
    return { success: false, skipped: true, reason: 'reporte_diario_off' };
  }
  if (!forzar && !esPrueba && !esDiaDeReporteDiario(ajustes)) {
    return { success: true, skipped: true, reason: 'dia_no_programado' };
  }
  const hoy = fechaHoyMexico();
  const ultimo = ajustes.reporte_diario_ultimo
    ? String(ajustes.reporte_diario_ultimo).slice(0, 10)
    : '';
  if (!forzar && !esPrueba && ultimo === hoy) {
    return { success: true, skipped: true, reason: 'ya_enviado', dia: hoy };
  }

  let destinos;
  if (esPrueba) {
    destinos = [...new Set(
      (soloDestinatarios || [])
        .map((e) => String(e || '').trim().toLowerCase())
        .filter((e) => e.includes('@'))
    )];
  } else {
    const lista = await listarDestinatariosNotif(ajustes);
    destinos = [...new Set(lista.map((d) => d.email))];
  }
  if (!destinos.length) {
    return { success: false, reason: 'sin_destinatarios' };
  }

  const pool = (await import('../config/db.js')).default;
  const [[{ por_recibir }]] = await pool.query(
    `SELECT COUNT(*) AS por_recibir FROM requerimientos WHERE estado = 'en_revision'`
  );
  const [[{ en_proceso }]] = await pool.query(
    `SELECT COUNT(*) AS en_proceso FROM requerimientos WHERE estado = 'recibido'`
  );
  const [[{ incompletos }]] = await pool.query(
    `SELECT COUNT(*) AS incompletos FROM requerimientos WHERE estado = 'incompleto'`
  );
  const [[{ listos_oc }]] = await pool.query(
    `SELECT COUNT(*) AS listos_oc FROM requerimientos
     WHERE estado = 'aprobado' AND orden_compra_id IS NULL`
  );
  const [viejos] = await pool.query(
    `SELECT r.consecutivo, r.tipo, r.estado, u.nombre AS solicitante,
            DATEDIFF(NOW(), r.created_at) AS dias
     FROM requerimientos r
     JOIN usuarios u ON u.id = r.solicitante_id
     WHERE r.estado IN ('en_revision', 'recibido', 'incompleto', 'aprobado')
       AND (r.estado <> 'aprobado' OR r.orden_compra_id IS NULL)
     ORDER BY r.created_at ASC
     LIMIT 8`
  );

  const [[{ oc_generadas }]] = await pool.query(
    `SELECT COUNT(*) AS oc_generadas FROM ordenes_compra WHERE estado = 'generada'`
  );
  const [[{ oc_distribuidas }]] = await pool.query(
    `SELECT COUNT(*) AS oc_distribuidas FROM ordenes_compra WHERE estado = 'distribuida'`
  );
  const [[{ oc_proceso }]] = await pool.query(
    `SELECT COUNT(*) AS oc_proceso FROM ordenes_compra WHERE estado = 'en_proceso'`
  );
  const [[{ oc_recibidas }]] = await pool.query(
    `SELECT COUNT(*) AS oc_recibidas FROM ordenes_compra WHERE estado = 'recibida'`
  );
  const [[{ oc_sin_po }]] = await pool.query(
    `SELECT COUNT(*) AS oc_sin_po FROM ordenes_compra
     WHERE estado IN ('generada','distribuida','en_proceso','recibida')
       AND (datatextnow_id IS NULL OR TRIM(datatextnow_id) = '' OR UPPER(TRIM(datatextnow_id)) = 'NA')`
  );
  const [ocViejas] = await pool.query(
    `SELECT oc.numero_oc, oc.estado, u.nombre AS solicitante,
            DATEDIFF(NOW(), oc.created_at) AS dias
     FROM ordenes_compra oc
     JOIN requerimientos r ON r.id = oc.requerimiento_id
     JOIN usuarios u ON u.id = r.solicitante_id
     WHERE oc.estado IN ('generada','distribuida','en_proceso','recibida')
     ORDER BY oc.created_at ASC
     LIMIT 8`
  );

  const baseUrl = frontendUrlEfectiva(ajustes);
  const linkBandeja = `${baseUrl}/dashboard.html#bandeja`;
  const linkOc = `${baseUrl}/dashboard.html#bandeja-oc`;
  const filas = (viejos || []).map((r) =>
    `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${r.consecutivo || '—'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${r.tipo || ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${etiquetaEstadoReq(r.estado)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${r.solicitante || ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.dias}d</td>
    </tr>`
  ).join('');
  const filasOc = (ocViejas || []).map((r) =>
    `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${r.numero_oc || '—'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${r.estado}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${r.solicitante || ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.dias}d</td>
    </tr>`
  ).join('');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;background:#f8fafc;padding:24px;">
      <div style="background:white;border-radius:8px;padding:24px;">
        ${buildEmailBrandingHtml()}
        <h2 style="color:#1e40af;margin:0 0 8px;font-size:18px;">Resumen diario de Compras</h2>
        ${esPrueba ? '<p style="color:#92400e;background:#fef3c7;padding:8px 10px;border-radius:6px;font-size:13px;margin:0 0 12px;">Envío de prueba: solo te llegó a ti. Compras no recibió este correo.</p>' : ''}
        <p style="color:#64748b;font-size:13px;margin:0 0 16px;">${hoy} · bandeja REQ y OC</p>
        <p style="font-size:13px;font-weight:700;color:#334155;margin:0 0 6px;">Requerimientos</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:14px;">
          <tr><td style="padding:6px 0;color:#64748b;">En revisión</td><td style="text-align:right;font-weight:700;">${Number(por_recibir) || 0}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Recibido</td><td style="text-align:right;font-weight:700;">${Number(en_proceso) || 0}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Incompleto</td><td style="text-align:right;font-weight:700;">${Number(incompletos) || 0}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Aprobado</td><td style="text-align:right;font-weight:700;">${Number(listos_oc) || 0}</td></tr>
        </table>
        ${filas ? `
        <p style="font-size:13px;font-weight:700;color:#334155;margin:0 0 8px;">REQ más antiguos (FIFO)</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px;">
          <tr style="background:#f1f5f9;text-align:left;">
            <th style="padding:6px 8px;">N°</th><th style="padding:6px 8px;">Tipo</th>
            <th style="padding:6px 8px;">Estado</th><th style="padding:6px 8px;">Solicitante</th>
            <th style="padding:6px 8px;text-align:right;">Días</th>
          </tr>
          ${filas}
        </table>` : '<p style="color:#64748b;font-size:14px;">No hay requerimientos pendientes.</p>'}
        <p style="font-size:13px;font-weight:700;color:#334155;margin:16px 0 6px;">Órdenes de compra</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:14px;">
          <tr><td style="padding:6px 0;color:#64748b;">Generadas</td><td style="text-align:right;font-weight:700;">${Number(oc_generadas) || 0}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Distribuidas</td><td style="text-align:right;font-weight:700;">${Number(oc_distribuidas) || 0}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">En proceso</td><td style="text-align:right;font-weight:700;">${Number(oc_proceso) || 0}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Recibidas</td><td style="text-align:right;font-weight:700;">${Number(oc_recibidas) || 0}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Sin PO / NA</td><td style="text-align:right;font-weight:700;">${Number(oc_sin_po) || 0}</td></tr>
        </table>
        ${filasOc ? `
        <p style="font-size:13px;font-weight:700;color:#334155;margin:0 0 8px;">OC más antiguas (FIFO)</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="background:#f1f5f9;text-align:left;">
            <th style="padding:6px 8px;">N°</th><th style="padding:6px 8px;">Estado</th>
            <th style="padding:6px 8px;">Solicitante</th>
            <th style="padding:6px 8px;text-align:right;">Días</th>
          </tr>
          ${filasOc}
        </table>` : '<p style="color:#64748b;font-size:14px;">No hay OC activas.</p>'}
        <p style="text-align:center;margin:22px 0 0;">
          <a href="${linkBandeja}" style="background:#185FA5;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;margin:0 6px 8px;">Bandeja REQ</a>
          <a href="${linkOc}" style="background:#0f766e;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;margin:0 6px 8px;">Bandeja OC</a>
        </p>
      </div>
    </div>`;

  const text = `Resumen diario Compras ${hoy}
REQ En revisión: ${Number(por_recibir) || 0}
REQ Recibido: ${Number(en_proceso) || 0}
REQ Incompleto: ${Number(incompletos) || 0}
REQ Aprobado: ${Number(listos_oc) || 0}
OC Generadas: ${Number(oc_generadas) || 0}
OC Distribuidas: ${Number(oc_distribuidas) || 0}
OC En proceso: ${Number(oc_proceso) || 0}
OC Recibidas: ${Number(oc_recibidas) || 0}
OC Sin PO: ${Number(oc_sin_po) || 0}
Bandeja REQ: ${linkBandeja}
Bandeja OC: ${linkOc}`;

  const result = await enviarCorreo({
    to: destinos[0],
    cc: destinos.length > 1 ? destinos.slice(1).join(',') : undefined,
    subject: esPrueba
      ? `PRUEBA · Resumen diario Compras · ${hoy}`
      : `Resumen diario Compras · ${hoy}`,
    html,
    text,
    attachments: getEmailBrandingAttachments(),
  });

  if (result?.success && !esPrueba) {
    await marcarReporteDiarioEnviado(hoy);
  }
  console.log(`[Email] Reporte diario Compras ${hoy}${esPrueba ? ' (prueba)' : ''} → ${destinos.join(', ')} success=${!!result?.success}`);
  return {
    ...result,
    dia: hoy,
    destinatarios: destinos.length,
    enviados_a: destinos,
    prueba: esPrueba,
  };
}

export function iniciarSchedulerReporteDiario() {
  const TICK_MS = 15 * 60 * 1000;
  const tick = async () => {
    try {
      const hora = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Mexico_City',
          hour: 'numeric',
          hour12: false,
        }).format(new Date())
      );
      if (hora < 7) return;
      const r = await enviarReporteDiarioCompras({ forzar: false });
      if (r?.skipped) return;
    } catch (err) {
      console.warn('[Email] Scheduler reporte diario:', err.message);
    }
  };
  setInterval(tick, TICK_MS);
  setTimeout(tick, 45_000);
}
