/**
 * Fusiona duplicados de import (nombre completo) con la cuenta de login
 * (nombre corto). Conserva el nombre corto que se usa en operación.
 *
 * Al arrancar el backend se aplica sola (migración idempotente).
 * Este script sirve para inspeccionar o forzar el mismo proceso.
 *
 * Uso:
 *   node backend/scripts/corregir-nombres-usuarios.mjs           # dry-run
 *   node backend/scripts/corregir-nombres-usuarios.mjs --apply   # aplica
 */
import '../src/config/env.js';
import pool from '../src/config/db.js';
import { aplicarCorreccionNombres, esEmailImport } from '../src/utils/nombresUsuarios.js';

const APPLY = process.argv.includes('--apply');

function fmt(u) {
  if (!u) return '—';
  const act = Number(u.activo) === 1 ? 'activo' : 'inactivo';
  const reqs = u.n_req != null ? ` reqs=${u.n_req}` : '';
  return `#${u.id} "${u.nombre}" <${u.email}> ${act}${reqs}`;
}

function mainResumen(r) {
  const s = r.resumen || {};
  console.log(
    `\nResumen: ${s.pares || 0} par(es), `
    + `${s.aRevertir || 0} nombre(s) restaurado(s) a corto, `
    + `${s.reqs || 0} REQ a reasignar, `
    + `${s.aEliminar || 0} placeholder(s) a eliminar, `
    + `${s.omitidos || 0} omitido(s).`
  );
}

try {
  const result = await aplicarCorreccionNombres(pool, { dryRun: !APPLY });

  console.log(APPLY ? '=== APPLY — corrección de nombres ===' : '=== DRY-RUN (sin cambios) ===');

  const reverts = result.reverts || [];
  if (!result.plan.length && !reverts.length && !result.omitidos.length) {
    console.log('No hay duplicados de nombre que fusionar.');
    mainResumen(result);
    await pool.end();
    process.exit(0);
  }

  if (reverts.length) {
    console.log('\n— Restaurar nombre corto de operación —');
    for (const r of reverts) {
      console.log(`  ${fmt(r.usuario)}`);
      console.log(`    "${r.nombreAnterior}" → "${r.nombreNuevo}"`);
    }
  }

  for (const c of result.plan) {
    console.log(`\nCanónica  ${fmt(c.canonica)}`);
    console.log(`Duplicado ${fmt(c.duplicado)}${esEmailImport(c.duplicado.email) ? ' [import]' : ''}`);
    if (c.renombrar) {
      console.log(`  nombre: "${c.nombreAnterior}" → "${c.nombreNuevo}"`);
    } else {
      console.log(`  nombre: sin cambio ("${c.nombreAnterior}")`);
    }
    if (c.reqsAMover) console.log(`  reasignar ${c.reqsAMover} REQ`);
    if (c.eliminarPlaceholder) {
      console.log(c.eliminado ? '  placeholder @import.local eliminado' : '  placeholder @import.local se elimina si queda sin FKs');
    }
    if (c.fks?.total) {
      const bits = Object.entries(c.fks.detalle)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}=${n}`);
      console.log(`  FKs: ${bits.join(', ') || c.fks.total}`);
    }
  }

  if (result.omitidos.length) {
    console.log('\n— Omitidos (no se tocan) —');
    for (const o of result.omitidos) {
      console.log(`  ${o.omitir}: ${fmt(o.a)}  ↔  ${fmt(o.b)}`);
    }
  }

  mainResumen(result);

  if (!APPLY) {
    console.log('\nEjecuta con --apply para escribir. En el servidor se aplica al reiniciar el backend.');
  } else {
    console.log('\nOK. Cambios aplicados.');
  }

  await pool.end();
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
  try { await pool.end(); } catch { /* ignore */ }
}
