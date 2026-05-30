/**
 * Script de prueba para enviar "Solicitud de Cotización" por correo.
 * 
 * Uso:
 *   node scripts/test-solicitud-cotizacion.js 123
 * 
 * Reemplaza 123 por el ID real de una cotización existente.
 */

import { enviarSolicitudDeCotizacion } from '../src/utils/emailService.js';

const cotizacionId = process.argv[2];

if (!cotizacionId) {
  console.error('\n❌ Error: Debes proporcionar el ID de la cotización.');
  console.log('Uso: node scripts/test-solicitud-cotizacion.js <cotizacion_id>\n');
  console.log('Ejemplo: node scripts/test-solicitud-cotizacion.js 15\n');
  process.exit(1);
}

console.log(`\n📧 Enviando solicitud de cotización para cotización ID: ${cotizacionId}...\n`);

try {
  const resultado = await enviarSolicitudDeCotizacion(parseInt(cotizacionId, 10));

  if (resultado.success) {
    console.log('✅ ¡Correo enviado exitosamente!');
    console.log(`   Message ID: ${resultado.messageId}`);
    console.log(`   Revisa la bandeja de entrada (y spam) del proveedor.\n`);
  } else {
    console.error('❌ El correo no se pudo enviar.');
    console.error('   Razón:', resultado.reason || resultado.error || 'Desconocida');
    console.log('\nRevisa las variables de entorno EMAIL_* en tu archivo .env\n');
  }
} catch (error) {
  console.error('\n❌ Error inesperado al intentar enviar el correo:');
  console.error(error);
  console.log('\nPosibles causas:');
  console.log('  - Credenciales SMTP incorrectas en .env');
  console.log('  - El proveedor no tiene email registrado');
  console.log('  - No existe la cotización con ese ID');
  console.log('  - Problemas de red o firewall\n');
}

process.exit(0);