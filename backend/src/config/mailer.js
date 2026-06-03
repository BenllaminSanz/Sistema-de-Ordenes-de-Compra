import nodemailer from 'nodemailer';
import "../config/env.js";

// DEBUG en consola del servidor
console.log("--- Configuración SMTP ---");
console.log("EMAIL_HOST:", process.env.EMAIL_HOST || "smtp.office365.com (default)");
console.log("EMAIL_USER:", process.env.EMAIL_USER || "NO ENCONTRADO");
console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "******** (configurado)" : "NO ENCONTRADO");
console.log("--------------------------");

// Configuración flexible del transporter (soporta cualquier SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.office365.com",
  port: parseInt(process.env.EMAIL_PORT || "587", 10),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    ciphers: process.env.EMAIL_TLS_CIPHERS || 'SSLv3',
    rejectUnauthorized: process.env.EMAIL_REJECT_UNAUTHORIZED !== 'false'
  }
});

// Verificar conexión al iniciar (muy útil para diagnosticar)
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Error de configuración SMTP:", error.message);
  } else {
    console.log("✅ Servidor SMTP listo para enviar correos.");
  }
});

/**
 * Función genérica para enviar cualquier correo
 */
export const enviarCorreo = async ({ to, subject, html, text }) => {
  try {
    const mailOptions = {
      from: `"Sistema de Órdenes de Compra" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || undefined
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Correo enviado a ${to} | MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Error enviando correo a ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Mantener compatibilidad con función anterior
 * Validar logica si aun es util para la nueva función del catalogo
 */
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

export default transporter;