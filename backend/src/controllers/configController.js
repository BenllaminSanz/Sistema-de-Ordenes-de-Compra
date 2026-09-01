import { obtenerConfig, guardarConfig, desactivarConfig, obtenerConfigParaMailer } from '../models/configSmtp.js';
import {
  obtenerAjustesCorreo,
  guardarAjustesCorreo,
  listarDestinatariosNotif,
  frontendUrlEfectiva,
  urlPublicaDesdeRequest,
  esLocalhost,
} from '../models/configApp.js';
import { recargarTransporter, enviarCorreo, getFromAddress, getConfigSource, getTransporter } from '../config/mailer.js';
import logger from '../utils/logger.js';
import {
  EMPRESA_SUBTITULO,
  buildEmailBrandingHtml,
  getEmailBrandingAttachments,
} from '../utils/emailBranding.js';

/**
 * GET /api/config/smtp
 * Devuelve la configuración actual (sin contraseña real).
 * Solo admin.
 */
async function bloqueNotificaciones(req) {
  const ajustes = await obtenerAjustesCorreo();
  const destinatarios = await listarDestinatariosNotif(ajustes);
  const efectiva = frontendUrlEfectiva(ajustes);
  const sugerida = urlPublicaDesdeRequest(req);
  return {
    frontend_url: ajustes.frontend_url || '',
    frontend_url_efectiva: efectiva,
    frontend_url_es_local: esLocalhost(efectiva),
    frontend_url_sugerida: sugerida && !esLocalhost(sugerida) ? sugerida : '',
    notif_req_revision: !!ajustes.notif_req_revision,
    email_notif_compras: ajustes.email_notif_compras || '',
    notif_roles: Array.isArray(ajustes.notif_roles) ? ajustes.notif_roles : ['compras', 'admin'],
    reporte_diario: ajustes.reporte_diario !== false,
    reporte_diario_dias: Array.isArray(ajustes.reporte_diario_dias)
      ? ajustes.reporte_diario_dias
      : [1, 2, 3, 4, 5],
    purga_borradores: ajustes.purga_borradores !== false,
    destinatarios,
  };
}

export async function getSmtpConfig(req, res) {
  try {
    const cfg = await obtenerConfig();
    const notificaciones = await bloqueNotificaciones(req);

    if (!cfg) {
      // No hay config en DB → informar que se usa .env
      return res.json({
        usando_env: true,
        mensaje: 'No hay configuración SMTP en base de datos. Se están usando las variables de entorno (.env).',
        config: null,
        notificaciones,
      });
    }

    res.json({
      usando_env: false,
      config: cfg,
      notificaciones,
    });
  } catch (err) {
    logger.error('[getSmtpConfig]', err);
    res.status(500).json({ mensaje: 'Error al obtener configuración SMTP' });
  }
}

export async function updateNotificaciones(req, res) {
  try {
    const body = req.body || {};
    const ajustes = await guardarAjustesCorreo({
      frontend_url: body.frontend_url,
      notif_req_revision: body.notif_req_revision,
      email_notif_compras: body.email_notif_compras,
      notif_roles: body.notif_roles,
      reporte_diario: body.reporte_diario,
      reporte_diario_dias: body.reporte_diario_dias,
      purga_borradores: body.purga_borradores,
    }, req.usuario?.id || null);

    let mensaje = 'Ajustes de notificaciones guardados';
    if (body.purga_borradores === false) mensaje = 'Purga mensual de borradores desactivada';
    else if (body.purga_borradores === true) mensaje = 'Purga mensual de borradores activada';
    else if (body.notif_req_revision === false) mensaje = 'Notificaciones de REQ en revisión desactivadas';
    else if (body.notif_req_revision === true && body.notif_roles === undefined) {
      mensaje = 'Notificaciones de REQ en revisión activadas';
    } else if (body.notif_roles) mensaje = 'Destinatarios actualizados';

    res.json({
      mensaje,
      notificaciones: await bloqueNotificaciones(req),
      ajustes,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ mensaje: err.message });
    logger.error('[updateNotificaciones]', err);
    res.status(500).json({ mensaje: err.message || 'Error al guardar notificaciones' });
  }
}

/**
 * PUT /api/config/smtp
 * Guarda/actualiza la configuración SMTP (admin only).
 * Body: { host, port, secure, user, pass?, from_name?, tls_ciphers?, reject_unauthorized? }
 * Si pass viene vacío o ausente, mantiene el anterior.
 */
export async function updateSmtpConfig(req, res) {
  try {
    const datos = req.body || {};

    // Validaciones básicas
    if (!datos.host || typeof datos.host !== 'string' || datos.host.trim().length < 3) {
      return res.status(400).json({ mensaje: 'El campo host es obligatorio' });
    }
    if (!datos.user || typeof datos.user !== 'string' || datos.user.trim().length < 3) {
      return res.status(400).json({ mensaje: 'El campo user (correo remitente) es obligatorio' });
    }
    if (datos.port && (isNaN(Number(datos.port)) || Number(datos.port) < 1)) {
      return res.status(400).json({ mensaje: 'Puerto inválido' });
    }

    const { id, sesionDesactualizada } = await guardarConfig(datos, req.usuario?.id || null);
    if (sesionDesactualizada) {
      logger.warn('[updateSmtpConfig] Token con id de usuario inexistente en BD (sesión anterior al respaldo).');
    }

    // Recargar transporter inmediatamente para que los próximos envíos usen la nueva config
    await recargarTransporter();

    const nuevaCfg = await obtenerConfig();

    res.json({
      mensaje: 'Configuración SMTP guardada correctamente',
      id,
      config: nuevaCfg,
      ...(sesionDesactualizada && {
        aviso: 'Tu sesión usa un usuario de la BD anterior. Cierra sesión e inicia de nuevo para sincronizar tu cuenta.',
      }),
    });
  } catch (err) {
    logger.error('[updateSmtpConfig]', err);
    res.status(500).json({ mensaje: err.message || 'Error al guardar configuración SMTP' });
  }
}

/**
 * POST /api/config/smtp/test
 * Prueba la conexión SMTP actual (usa lo que está cargado en memoria).
 * Opcionalmente acepta config temporal en body para probar sin guardar.
 */
export async function testSmtpConnection(req, res) {
  try {
    const body = req.body || {};
    let testResult;

    if (body.host && body.user) {
      // Prueba con datos temporales (no guarda)
      // Necesitamos construir un transporter temporal
      const nodemailer = (await import('nodemailer')).default;
      const tempPass = body.pass || '';

      const tempTransporter = nodemailer.createTransport({
        host: body.host,
        port: Number(body.port) || 587,
        secure: !!body.secure,
        auth: body.user && tempPass ? { user: body.user, pass: tempPass } : undefined,
        tls: {
          ciphers: body.tls_ciphers || 'SSLv3',
          rejectUnauthorized: body.reject_unauthorized !== undefined ? !!body.reject_unauthorized : false
        }
      });

      await new Promise((resolve, reject) => {
        tempTransporter.verify((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      testResult = { success: true, mensaje: 'Conexión exitosa con los datos proporcionados (no guardados)' };
    } else {
      // Usar configuración actual en memoria (DB o .env)
      const transporter = getTransporter();
      if (!transporter) {
        return res.status(400).json({ success: false, mensaje: 'No hay transporter configurado' });
      }

      await new Promise((resolve, reject) => {
        transporter.verify((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      testResult = {
        success: true,
        mensaje: 'Conexión SMTP exitosa',
        fuente: getConfigSource() || 'actual'
      };
    }

    res.json(testResult);
  } catch (err) {
    logger.error('[testSmtpConnection]', err);
    res.status(400).json({
      success: false,
      mensaje: 'Fallo en la conexión SMTP',
      error: err.message
    });
  }
}

/**
 * POST /api/config/smtp/test-email
 * Envía un correo de prueba a la dirección indicada usando la config actual.
 */
export async function sendTestEmail(req, res) {
  try {
    const { to } = req.body || {};

    if (!to || typeof to !== 'string' || !to.includes('@')) {
      return res.status(400).json({ mensaje: 'Debe proporcionar un correo destino válido (to)' });
    }

    const from = getFromAddress();

    const html = `
      <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; padding:24px; background:#f8fafc;">
        <div style="background:white; border-radius:8px; padding:32px; box-shadow:0 2px 10px rgba(0,0,0,0.06);">
          ${buildEmailBrandingHtml()}
          <h2 style="color:#185FA5; margin-top:0;">✅ Prueba de configuración SMTP</h2>
          <p style="color:#334155; font-size:15px;">
            Este es un correo de prueba enviado desde el <strong>Sistema de Órdenes de Compra</strong>.
          </p>
          <p style="color:#334155; font-size:14px;">
            <strong>Fecha:</strong> ${new Date().toLocaleString('es-MX')}<br>
            <strong>Remitente configurado:</strong> ${from}
          </p>
          <hr style="border:none; border-top:1px solid #e2e8f0; margin:20px 0;">
          <p style="font-size:13px; color:#64748b;">
            Si recibiste este mensaje, la configuración SMTP está funcionando correctamente.
          </p>
        </div>
      </div>
    `;

    const result = await enviarCorreo({
      to: to.trim(),
      subject: `Prueba de SMTP - ${EMPRESA_SUBTITULO}`,
      html,
      text: `Prueba de SMTP exitosa. Remitente: ${from}`,
      attachments: getEmailBrandingAttachments(),
    });

    if (result.success) {
      res.json({
        success: true,
        mensaje: `Correo de prueba enviado correctamente a ${to}`,
        messageId: result.messageId
      });
    } else {
      res.status(400).json({
        success: false,
        mensaje: 'No se pudo enviar el correo de prueba',
        error: result.error
      });
    }
  } catch (err) {
    logger.error('[sendTestEmail]', err);
    res.status(500).json({ mensaje: 'Error al enviar correo de prueba', error: err.message });
  }
}

/**
 * DELETE /api/config/smtp  (o PATCH desactivar)
 * Desactiva la config de DB para volver a usar .env.
 */
export async function resetToEnv(req, res) {
  try {
    await desactivarConfig();
    await recargarTransporter();

    res.json({
      mensaje: 'Configuración SMTP de base de datos desactivada. Ahora se usa la configuración de .env.',
      usando_env: true
    });
  } catch (err) {
    logger.error('[resetToEnv]', err);
    res.status(500).json({ mensaje: 'Error al resetear configuración' });
  }
}
