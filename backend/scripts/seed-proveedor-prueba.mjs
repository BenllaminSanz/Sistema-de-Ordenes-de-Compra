/**
 * Crea o actualiza un proveedor de prueba con el correo del admin (ADMIN_EMAIL).
 * Sirve para probar el envío de cotizaciones sin usar un proveedor real.
 *
 * Uso:
 *   node backend/scripts/seed-proveedor-prueba.mjs
 *   node backend/scripts/seed-proveedor-prueba.mjs --correo
 *
 * Con --correo replica el flujo de cotización: CC y Reply-To desde
 * Administración → Config SMTP (cc_cotizaciones) o EMAIL_CC_COTIZACIONES.
 *
 * Variables en .env (en este orden de prioridad para el correo del proveedor):
 *   PROVEEDOR_PRUEBA_EMAIL
 *   ADMIN_EMAIL
 *   PROVEEDOR_PRUEBA_NUM=99999
 *   PROVEEDOR_PRUEBA_NOMBRE=Proveedor Prueba (local)
 */

import '../src/config/env.js';
import pool from '../src/config/db.js';
import * as Proveedor from '../src/models/proveedores.js';
import { obtenerCcCotizaciones } from '../src/models/configSmtp.js';
import {
  enviarCorreo,
  getFromAddress,
  getConfigSource,
  recargarTransporter,
  getTransporter,
} from '../src/config/mailer.js';

const NUM_PROVEEDOR = process.env.PROVEEDOR_PRUEBA_NUM || '99999';
const NOMBRE = process.env.PROVEEDOR_PRUEBA_NOMBRE || 'Proveedor Prueba (local)';
const EMAIL = (
  process.env.PROVEEDOR_PRUEBA_EMAIL
  || process.env.ADMIN_EMAIL
  || 'jebesari48@gmail.com'
).toLowerCase().trim();
const ENVIAR_CORREO = process.argv.includes('--correo');

async function verificarSmtp() {
  await recargarTransporter();
  const transporter = getTransporter();
  return new Promise((resolve, reject) => {
    transporter.verify((err) => (err ? reject(err) : resolve()));
  });
}

async function main() {
  console.log('=== Proveedor de prueba ===');
  console.log(`Nº proveedor: ${NUM_PROVEEDOR}`);
  console.log(`Nombre: ${NOMBRE}`);
  console.log(`Email: ${EMAIL}`);

  let prov = await Proveedor.obtenerPorNumProveedor(NUM_PROVEEDOR);

  if (prov) {
    await Proveedor.actualizar(prov.id, {
      nombre: NOMBRE,
      email: EMAIL,
      notas: 'Proveedor local para pruebas de cotización y correo',
    });
    await Proveedor.cambiarEstado(prov.id, true);
    console.log(`✅ Proveedor actualizado (id ${prov.id})`);
  } else {
    const id = await Proveedor.crear({
      num_proveedor: NUM_PROVEEDOR,
      nombre: NOMBRE,
      email: EMAIL,
      notas: 'Proveedor local para pruebas de cotización y correo',
    });
    prov = await Proveedor.obtenerPorId(id);
    console.log(`✅ Proveedor creado (id ${id})`);
  }

  if (!ENVIAR_CORREO) {
    console.log('\nPara probar el envío SMTP desde el servidor:');
    console.log('  node backend/scripts/seed-proveedor-prueba.mjs --correo');
    console.log('\nLuego asigna este proveedor a una cotización en un REQ de ítems libres o SERVICIOS.');
    await pool.end();
    return;
  }

  console.log('\n=== Prueba de envío SMTP ===');

  try {
    await verificarSmtp();
    console.log(`Fuente SMTP: ${getConfigSource()}`);
    console.log(`Remitente: ${getFromAddress()}`);

    const ccCotizaciones = await obtenerCcCotizaciones();
    if (ccCotizaciones) {
      console.log(`CC / Reply-To: ${ccCotizaciones}`);
    } else {
      console.warn('⚠️  Sin CC/Reply-To configurado. Configúralo en Administración → Config SMTP.');
    }

    const ahora = new Date().toLocaleString('es-MX');
    const ccLinea = ccCotizaciones
      ? `<br><strong>Copia / Responder a:</strong> ${ccCotizaciones}`
      : '';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f8fafc;">
        <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 10px rgba(0,0,0,0.06);">
          <h2 style="color: #185FA5; margin-top: 0;">Prueba de correo — Proveedor de prueba</h2>
          <p style="color: #334155; font-size: 15px;">
            Este mensaje simula una solicitud de cotización al proveedor
            <strong>${NOMBRE}</strong> (${NUM_PROVEEDOR}).
          </p>
          <p style="color: #334155; font-size: 14px;">
            <strong>Fecha:</strong> ${ahora}<br>
            <strong>Remitente:</strong> ${getFromAddress()}${ccLinea}
          </p>
          <p style="font-size: 13px; color: #64748b; margin-top: 20px;">
            Responde a este correo para verificar que la respuesta llega a Copia/Reply-To configurado en el sistema.
          </p>
        </div>
      </div>
    `;

    const textoCc = ccCotizaciones ? `\nCopia/Responder a: ${ccCotizaciones}` : '';
    const result = await enviarCorreo({
      to: EMAIL,
      cc: ccCotizaciones || undefined,
      replyTo: ccCotizaciones || undefined,
      subject: `Prueba SMTP — Proveedor ${NUM_PROVEEDOR}`,
      html,
      text: `Prueba SMTP. Proveedor ${NUM_PROVEEDOR} — ${NOMBRE}. Remitente: ${getFromAddress()}${textoCc}`,
    });

    if (result.success) {
      console.log(`✅ Correo enviado a ${EMAIL}`);
      if (ccCotizaciones) {
        console.log(`   CC / Reply-To: ${ccCotizaciones} (las respuestas deben llegar ahí)`);
      }
      console.log(`   MessageId: ${result.messageId}`);
    } else {
      console.error(`❌ No se pudo enviar: ${result.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ SMTP no disponible: ${err.message}`);
    console.log('   En desarrollo local es normal si el servidor de correo está en la red de la empresa.');
    console.log('   Ejecuta este script en el servidor con --correo para la prueba real.');
    process.exit(1);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  console.error(err);
  process.exit(1);
});