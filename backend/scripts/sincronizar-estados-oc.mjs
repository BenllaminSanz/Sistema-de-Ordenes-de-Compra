/**
 * Sincroniza estados de OC desde Excel BASE GRAL (p. ej. archivo con estados reales de cierre).
 *
 * Uso:
 *   node scripts/sincronizar-estados-oc.mjs --dry-run --file "D:/Descargas/BASE GRAL DE REQ. 23.07.26 (1).xlsx"
 *   node scripts/sincronizar-estados-oc.mjs --apply --file "..."
 *
 * Mapeo:
 *   Cerrada     → cerrada
 *   Distribuida → distribuida
 *   Parcial     → en_proceso
 *   Cancelada   → cancelada
 *
 * No borra REQ/OC. Solo actualiza estados de OC existentes (por N°/consecutivo).
 */

import fs from 'fs';
import '../src/config/env.js';
import pool from '../src/config/db.js';
import { parseExcelRequerimientos } from '../src/utils/excelRequerimientos.js';
import { sincronizarEstadosOcDesdeExcel } from '../src/utils/syncEstadosOc.js';

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');
const fileArg = arg('--file', null);
const defaultFile = 'D:/Descargas/BASE GRAL DE REQ. 23.07.26 (1).xlsx';
const filePath = fileArg && fileArg !== true ? fileArg : defaultFile;

async function resolveActorId() {
  const [[admin]] = await pool.query(
    `SELECT id, nombre, email FROM usuarios
     WHERE rol = 'admin' AND activo = 1
     ORDER BY id ASC LIMIT 1`
  );
  if (admin) return admin;
  const [[any]] = await pool.query(
    `SELECT id, nombre, email FROM usuarios ORDER BY id ASC LIMIT 1`
  );
  return any || null;
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(' Sync estados OC desde Excel BASE GRAL');
  console.log('═══════════════════════════════════════════════════');
  console.log('Archivo :', filePath);
  console.log('dry-run :', dryRun);
  console.log('apply   :', apply);
  console.log('Mapeo   : Cerrada→cerrada | Parcial→en_proceso | Distribuida→distribuida | Cancelada→cancelada');

  if (!dryRun && !apply) {
    console.log(`
Uso:
  node scripts/sincronizar-estados-oc.mjs --dry-run
  node scripts/sincronizar-estados-oc.mjs --apply --file "ruta.xlsx"
`);
    process.exit(0);
  }

  if (!fs.existsSync(filePath)) {
    console.error('No se encontró el archivo:', filePath);
    process.exit(1);
  }

  const actor = await resolveActorId();
  if (!actor) {
    console.error('No hay usuarios en la BD.');
    process.exit(1);
  }
  console.log('Actor   :', actor.id, actor.nombre);

  const buffer = fs.readFileSync(filePath);
  const parsed = parseExcelRequerimientos(buffer);
  console.log('\n── Parse ──');
  console.log('Layout:', parsed.layout, 'filas:', parsed.filas.length);

  // Conteo por ocEstado del parse
  const porOc = {};
  for (const f of parsed.filas) {
    const k = f.ocEstado || '(sin OC)';
    porOc[k] = (porOc[k] || 0) + 1;
  }
  console.log('ocEstado parseado:', porOc);

  const reporte = await sincronizarEstadosOcDesdeExcel({
    db: pool,
    filas: parsed.filas,
    actorUserId: actor.id,
    dryRun: dryRun || !apply,
  });

  console.log('\n── Resultado ──');
  console.log(reporte.mensaje);
  console.log('porCambio   :', reporte.porCambio);
  console.log('porObjetivo :', reporte.porObjetivo);
  console.log('sinCambio   :', reporte.sinCambio);
  console.log('sinOcEnBd   :', reporte.sinOcEnBd);
  console.log('muestra     :', reporte.muestra);
  if (reporte.sinOcMuestra?.length) {
    console.log('sin OC (muestra):', reporte.sinOcMuestra.slice(0, 10));
  }
  if (reporte.errores?.length) {
    console.log('errores:', reporte.errores.slice(0, 20));
  }

  if (apply && !dryRun) {
    const [est] = await pool.query(
      'SELECT estado, COUNT(*) c FROM ordenes_compra GROUP BY estado ORDER BY c DESC'
    );
    console.log('\n── OC en BD después ──');
    console.log(est);
  }

  await pool.end();
  process.exit(reporte.ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error('FATAL:', err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
