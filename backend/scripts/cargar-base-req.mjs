/**
 * Recarga histórica BASE GRAL: opcionalmente borra REQ/OC/cotizaciones/recepciones
 * y carga el Excel como fuente de verdad.
 *
 * Conserva: usuarios, catálogo, proveedores, áreas, SMTP.
 *
 * Uso (en el servidor, dentro de backend/):
 *
 *   # 1) Simular (no escribe)
 *   node scripts/cargar-base-req.mjs --archivo "D:\ruta\BASE GRAL....xlsx" --dry-run
 *
 *   # 2) Borrar flujo REQ/OC y cargar todo del Excel
 *   node scripts/cargar-base-req.mjs --archivo "D:\ruta\BASE GRAL....xlsx" --wipe --apply
 *
 * Flags:
 *   --archivo=RUTA   Excel BASE GRAL (requerido)
 *   --dry-run        Solo valida y resume (no escribe)
 *   --wipe           Borra REQ/OC/recepciones/cotizaciones antes de cargar
 *   --apply          Ejecuta escritura (sin esto y sin dry-run, aborta por seguridad)
 *   --actor=ID       usuario id que aparece en historial (default: primer admin)
 */

import fs from 'fs';
import path from 'path';
import pool from '../src/config/db.js';
import { importarBaseRequerimientos } from '../src/utils/importBaseReq.js';

function arg(name, def = null) {
  const pref = `--${name}=`;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith(pref)) return a.slice(pref.length);
    if (a === `--${name}`) {
      const next = argv[i + 1];
      // Flag booleano si no hay valor o el siguiente es otro flag
      if (!next || next.startsWith('--')) return true;
      return next;
    }
  }
  return def;
}

async function resolverActorId(explicit) {
  if (explicit) {
    const id = parseInt(explicit, 10);
    if (!Number.isFinite(id)) throw new Error('--actor debe ser un id numérico');
    return id;
  }
  const [[admin]] = await pool.query(
    `SELECT id FROM usuarios WHERE rol = 'admin' AND activo = 1 ORDER BY id ASC LIMIT 1`
  );
  if (admin?.id) return admin.id;
  const [[any]] = await pool.query(`SELECT id FROM usuarios ORDER BY id ASC LIMIT 1`);
  if (!any?.id) throw new Error('No hay usuarios en la BD para usar como actor');
  return any.id;
}

async function main() {
  const archivo = arg('archivo') || arg('file');
  const dryRun = Boolean(arg('dry-run') || arg('dry_run'));
  const wipe = Boolean(arg('wipe'));
  const apply = Boolean(arg('apply'));
  const actorArg = arg('actor');

  if (!archivo || archivo === true) {
    console.error('Falta --archivo=ruta\\al\\BASE_GRAL.xlsx');
    process.exit(1);
  }

  const abs = path.resolve(String(archivo));
  if (!fs.existsSync(abs)) {
    console.error('No existe el archivo:', abs);
    process.exit(1);
  }

  if (!dryRun && !apply) {
    console.error('Seguridad: indique --dry-run (simular) o --wipe --apply (ejecutar).');
    process.exit(1);
  }

  if (apply && !wipe && !dryRun) {
    console.warn(
      'AVISO: --apply sin --wipe solo agrega N° que no existan (no reemplaza todo).'
    );
    console.warn('Para “todo nuevo desde Excel” use: --wipe --apply');
  }

  const buffer = fs.readFileSync(abs);
  const actorUserId = await resolverActorId(actorArg);

  console.log('=== Carga BASE GRAL ===');
  console.log('Archivo :', abs);
  console.log('Actor   :', actorUserId);
  console.log('dryRun  :', dryRun);
  console.log('wipe    :', wipe && !dryRun);
  console.log('apply   :', apply && !dryRun);
  console.log('');

  if (wipe && !dryRun) {
    console.log('⚠  Se borrarán REQ, OC, cotizaciones, recepciones e historial de esos flujos.');
    console.log('   Se conservan usuarios, catálogo, proveedores, áreas y SMTP.');
    console.log('');
  }

  const reporte = await importarBaseRequerimientos({
    buffer,
    actorUserId,
    wipe: wipe && !dryRun,
    dryRun,
  });

  const resumen = {
    ok: reporte.ok !== false,
    dryRun: reporte.dryRun,
    wipe: reporte.wipe,
    layout: reporte.parseMeta?.layout,
    totalFilas: reporte.totalFilas,
    importados: reporte.importados,
    ocsCreadas: reporte.ocsCreadas,
    saltados: reporte.saltados,
    usuariosCreados: reporte.usuariosCreados?.length || 0,
    sinCatalogo: reporte.sinCatalogo?.length || 0,
    duplicados: reporte.duplicados?.length || 0,
    errores: reporte.errores?.length || 0,
    porEstadoReq: reporte.porEstadoReq,
    porEstadoOc: reporte.porEstadoOc,
    mensaje: reporte.mensaje,
  };

  console.log(JSON.stringify(resumen, null, 2));

  if (reporte.errores?.length) {
    console.log('\nPrimeros errores:');
    for (const e of reporte.errores.slice(0, 15)) {
      console.log(' -', typeof e === 'string' ? e : JSON.stringify(e));
    }
  }
  if (reporte.sinCatalogo?.length) {
    console.log('\nSin match catálogo (muestra):', reporte.sinCatalogo.slice(0, 8));
  }

  await pool.end();
  process.exit(reporte.ok === false ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
