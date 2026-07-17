import nodemailer from 'nodemailer';
import "../config/env.js";
import { obtenerConfigParaMailer } from '../models/configSmtp.js';

// =====================================================
// Mailer dinámico con soporte de configuración en DB
// Prioridad: configuracion_smtp (activa) > variables .env > defaults
// =====================================================

let currentTransporter = null;
let currentConfigSource = 'env'; // 'db' | 'env'
let currentFromAddress = null;

/**
 * Construye el transporter a partir de un objeto de config.
 * config: { host, port, secure, user, pass, tls_ciphers?, reject_unauthorized? }
 */
function buildTransporter(cfg) {
  const host = cfg.host || process.env.EMAIL_HOST || 'smtp.office365.com';
  const port = Number(cfg.port) || Number(process.env.EMAIL_PORT) || 587;
  const secure = cfg.secure !== undefined ? !!cfg.secure : (process.env.EMAIL_SECURE === 'true');
  const user = cfg.user || process.env.EMAIL_USER;
  const pass = cfg.pass !== undefined ? cfg.pass : process.env.EMAIL_PASS;

  const tlsCiphers = cfg.tls_ciphers || process.env.EMAIL_TLS_CIPHERS || 'SSLv3';
  const rejectUnauthorized = cfg.reject_unauthorized !== undefined
    ? !!cfg.reject_unauthorized
    : (process.env.EMAIL_REJECT_UNAUTHORIZED !== 'false');

  // Timeouts cortos: si el SMTP de red local no responde, no bloquear la API ~20s
  const connectionTimeout = Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS) || 8000;
  const greetingTimeout = Number(process.env.EMAIL_GREETING_TIMEOUT_MS) || 8000;
  const socketTimeout = Number(process.env.EMAIL_SOCKET_TIMEOUT_MS) || 15000;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    tls: {
      ciphers: tlsCiphers,
      rejectUnauthorized
    }
  });
}

async function initializeMailer() {
  try {
    // Intentar primero configuración desde DB
    const dbCfg = await obtenerConfigParaMailer();

    if (dbCfg && dbCfg.host && dbCfg.user) {
      currentTransporter = buildTransporter(dbCfg);
      currentConfigSource = 'db';
      currentFromAddress = dbCfg.user;
      console.log('--- Configuración SMTP (desde DB) ---');
      console.log('EMAIL_HOST:', dbCfg.host);
      console.log('EMAIL_USER:', dbCfg.user);
      console.log('EMAIL_PORT:', dbCfg.port);
      console.log('EMAIL_SECURE:', dbCfg.secure);
      console.log('-------------------------------------');
    } else {
      // Fallback a .env
      currentTransporter = buildTransporter({});
      currentConfigSource = 'env';
      currentFromAddress = process.env.EMAIL_USER || null;
      console.log('--- Configuración SMTP (desde .env) ---');
      console.log('EMAIL_HOST:', process.env.EMAIL_HOST || 'smtp.office365.com (default)');
      console.log('EMAIL_USER:', process.env.EMAIL_USER || 'NO ENCONTRADO');
      console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? '******** (configurado)' : 'NO ENCONTRADO');
      console.log('---------------------------------------');
    }

    // Verificar al iniciar
    if (currentTransporter) {
      currentTransporter.verify((error, success) => {
        if (error) {
          const esRedLocal = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH/i.test(error.message);
          if (esRedLocal) {
            console.warn(
              `⚠️  SMTP no alcanzable desde este entorno (${error.message}). `
              + 'Normal en desarrollo local: el servidor de correo suele estar en la red de la empresa.'
            );
          } else {
            console.error('❌ Error de configuración SMTP:', error.message);
          }
        } else {
          console.log(`✅ Servidor SMTP listo para enviar correos. (fuente: ${currentConfigSource})`);
        }
      });
    }
  } catch (err) {
    console.error('[mailer] Error inicializando mailer:', err.message);
    // Último recurso: intentar crear uno básico con .env
    currentTransporter = buildTransporter({});
    currentConfigSource = 'env';
    currentFromAddress = process.env.EMAIL_USER || null;
  }
}

// Inicializar al cargar el módulo
initializeMailer();

/**
 * Recarga el transporter (llamar después de guardar config SMTP desde admin).
 * Útil para aplicar cambios sin reiniciar el servidor.
 */
export async function recargarTransporter() {
  console.log('[mailer] Recargando configuración SMTP...');
  await initializeMailer();
  return { source: currentConfigSource };
}

/**
 * Devuelve el transporter actual (siempre debe existir después de init).
 */
export function getTransporter() {
  if (!currentTransporter) {
    // Fallback de emergencia
    currentTransporter = buildTransporter({});
  }
  return currentTransporter;
}

/**
 * Devuelve el "from" actual (email del usuario SMTP).
 */
export function getFromAddress() {
  return currentFromAddress || process.env.EMAIL_USER || '';
}

/**
 * Devuelve la fuente actual de la configuración ('db' o 'env').
 */
export function getConfigSource() {
  return currentConfigSource;
}

/**
 * Función genérica para enviar cualquier correo.
 * Usa el transporter actual (puede provenir de DB o .env).
 */
export const enviarCorreo = async ({ to, cc, bcc, replyTo, subject, html, text, attachments }) => {
  const transporter = getTransporter();
  const from = getFromAddress();

  try {
    const mailOptions = {
      from: `"Sistema de Órdenes de Compra" <${from}>`,
      to,
      subject,
      html,
      text: text || undefined
    };

    if (cc) mailOptions.cc = cc;
    if (bcc) mailOptions.bcc = bcc;
    if (replyTo) mailOptions.replyTo = replyTo;
    if (attachments?.length) mailOptions.attachments = attachments;

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Correo enviado a ${to} | MessageId: ${info.messageId} (fuente:${currentConfigSource})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Error enviando correo a ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};

/** Compatibilidad: notificación simple de cotización registrada. */
export const enviarCorreoCotizacion = async (correoDestino, idCotizacion) => {
  return enviarCorreo({
    to: correoDestino,
    subject: `Nueva Cotización Registrada - Folio #${idCotizacion}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
        <h2 style="color: #0078d4;">Notificación de Cotización</h2>
        <p>Se ha registrado la cotización <strong>#${idCotizacion}</strong>.</p>
      </div>
    `
  });
};

// Export por defecto: función que devuelve el transporter actual (compatibilidad)
export default function getDefaultTransporter() {
  return getTransporter();
}