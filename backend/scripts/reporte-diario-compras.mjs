/**
 * Envía (o simula) el resumen diario a Compras.
 *   node scripts/reporte-diario-compras.mjs
 *   node scripts/reporte-diario-compras.mjs --force
 */
import '../src/config/env.js';
import { enviarReporteDiarioCompras } from '../src/utils/emailService.js';

const forzar = process.argv.includes('--force') || process.argv.includes('--forzar');
const r = await enviarReporteDiarioCompras({ forzar });
console.log(r);
process.exit(r?.success || r?.skipped ? 0 : 1);
