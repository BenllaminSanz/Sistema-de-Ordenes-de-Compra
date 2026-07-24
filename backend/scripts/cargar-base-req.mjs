/**
 * Carga de BASE GRAL DE REQ (plantilla Contabilidad).
 *
 * Uso habitual (servidor o local — SOLO agrega faltantes):
 *   node scripts/cargar-base-req.mjs --dry-run --file "ruta.xlsx"
 *   node scripts/cargar-base-req.mjs --apply --file "ruta.xlsx"
 *
 * Solo uso excepcional (recarga total, p. ej. primera migración local):
 *   node scripts/cargar-base-req.mjs --wipe --apply --file "ruta.xlsx"
 *
 * --dry-run  Solo analiza (no escribe BD)
 * --apply    Ejecuta la importación (omite consecutivos que ya existen)
 * --wipe     Borra REQ/OC/recepciones/cotizaciones ANTES (NO usar en prod salvo acuerdo)
 * --file     Ruta al .xlsx
 *
 * Requiere .env en la raíz del proyecto.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '../src/config/env.js';
import pool from '../src/config/db.js';
import { parseExcelRequerimientos } from '../src/utils/excelRequerimientos.js';
import { importarBaseRequerimientos } from '../src/utils/importBaseReq.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

const dryRun = process.argv.includes('--dry-run');
const wipe = process.argv.includes('--wipe');
const apply = process.argv.includes('--apply');
const fileArg = arg('--file', null);

const defaultFile = 'D:/Descargas/BASE GRAL DE REQ. 23.07.26.xlsx';
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
  console.log(' Carga BASE GRAL DE REQ');
  console.log('═══════════════════════════════════════════════════');
  console.log('Archivo :', filePath);
  console.log('dry-run :', dryRun);
  console.log('wipe    :', wipe);
  console.log('apply   :', apply);
  console.log('DB      :', process.env.DB_NAME, '@', process.env.DB_HOST || 'localhost');

  if (!dryRun && !apply) {
    console.log(`
Uso:
  node scripts/cargar-base-req.mjs --dry-run
  node scripts/cargar-base-req.mjs --wipe --apply

Opciones:
  --file "ruta.xlsx"   (default: ${defaultFile})
  --dry-run            analiza sin escribir
  --wipe               borra REQ/OC/recepciones/cotizaciones antes
  --apply              ejecuta la importación
`);
    process.exit(0);
  }

  if (!fs.existsSync(filePath)) {
    console.error('No se encontró el archivo:', filePath);
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  const parsed = parseExcelRequerimientos(buffer);

  console.log('\n── Parse ──');
  console.log('Layout          :', parsed.layout);
  console.log('Filas únicas    :', parsed.filas.length);
  console.log('Duplicados      :', parsed.duplicados.length);
  console.log('Hojas saltadas  :', parsed.hojasSaltadas);
  console.log('Meta            :', JSON.stringify(parsed.meta, null, 2));

  if (parsed.duplicados.length) {
    console.log('\nDuplicados (se omite la 2ª+ aparición):');
    for (const d of parsed.duplicados.slice(0, 20)) {
      console.log(`  · ${d.consecutivo} fila ${d.filaExcel} (original fila ${d.originalFila})`);
    }
  }

  const actor = await resolveActorId();
  if (!actor) {
    console.error('No hay usuarios en la BD. Crea un admin antes de importar.');
    process.exit(1);
  }
  console.log('\nActor import   :', actor.id, actor.nombre, actor.email);

  if (wipe && apply && !dryRun) {
    console.log('\n⚠  Se borrarán TODOS los requerimientos, OC, recepciones y cotizaciones locales.');
  }

  const reporte = await importarBaseRequerimientos({
    filas: parsed.filas,
    duplicados: parsed.duplicados,
    actorUserId: actor.id,
    wipe: wipe && apply && !dryRun,
    dryRun: dryRun || !apply,
  });

  console.log('\n── Resultado ──');
  console.log(reporte.mensaje);
  console.log('porEstadoReq :', reporte.porEstadoReq);
  console.log('porEstadoOc  :', reporte.porEstadoOc);
  console.log('items catálogo:', reporte.itemsCatalogo, ' libres:', reporte.itemsLibres);
  console.log('usuarios nuevos:', reporte.usuariosCreados.length);
  if (reporte.usuariosCreados.length) {
    console.log(reporte.usuariosCreados.slice(0, 30));
  }
  console.log('sin catálogo (muestra):', reporte.sinCatalogo.slice(0, 15));
  console.log('errores:', reporte.errores.length);
  if (reporte.errores.length) {
    console.log(reporte.errores.slice(0, 25));
  }
  console.log('duplicados omitidos:', reporte.duplicados.length);

  // Conteos post
  if (apply && !dryRun) {
    const [[{ reqs }]] = await pool.query('SELECT COUNT(*) reqs FROM requerimientos');
    const [[{ ocs }]] = await pool.query('SELECT COUNT(*) ocs FROM ordenes_compra');
    const [cons] = await pool.query('SELECT * FROM consecutivos_control ORDER BY anio, tipo');
    console.log('\n── BD después ──');
    console.log('requerimientos:', reqs, 'ordenes_compra:', ocs);
    console.log('consecutivos_control:', cons);
  }

  await pool.end();
  process.exit(reporte.ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error('FATAL:', err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
