import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuración para obtener la ruta del archivo .env correctamente
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Esto sube dos niveles desde src/config hasta la raíz del backend para buscar el .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

// DEBUG: Mira tu consola del servidor (la terminal de Node)
console.log("--- Verificación de Credenciales ---");
console.log("Correo:", process.env.EMAIL_USER || "NO ENCONTRADO");
console.log("Password:", process.env.EMAIL_PASS ? "Configurado (***)" : "NO ENCONTRADO");
console.log("------------------------------------");

const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
    }
});

/**
 * Envía el correo de la cotización
 */
export const enviarCorreoCotizacion = async (correoDestino, idCotizacion) => {
    try {
        const mailOptions = {
            from: `"Sistema de Órdenes de Compra" <${process.env.EMAIL_USER}>`,
            to: correoDestino,
            subject: `Nueva Cotización Registrada - Folio #${idCotizacion}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color: #0078d4;">Notificación de Cotización</h2>
                    <p>Se ha registrado la cotización <strong>#${idCotizacion}</strong>.</p>
                    <p>Por favor, ingrese al sistema para su revisión.</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Correo enviado:', info.messageId);
        return { success: true };
    } catch (error) {
        console.error("Error en el envío de correo:", error);
        return { success: false, error };
    }
};

export default transporter;