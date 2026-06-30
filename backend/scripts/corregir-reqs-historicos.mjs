/**
 * Corrige requerimientos históricos:
 *   1. Quita el prefijo "REQ-" de todos los consecutivos
 *   2. Asigna orden_compra_id a los reqs que ya tienen OC pero no están vinculados
 *   3. Cambia a "cerrado" los reqs vinculados a una OC (ya no pueden generar otra)
 *
 * Uso:
 *   node backend/scripts/corregir-reqs-historicos.mjs          → dry-run
 *   node backend/scripts/corregir-reqs-historicos.mjs --apply  → aplica cambios
 */

import pool from '../src/config/db.js';

const DRY_RUN = !process.argv.includes('--apply');

function sep(titulo) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${titulo}`);
  console.log('─'.repeat(60));
}

async function main() {
  console.log(DRY_RUN
    ? '\n=== DRY-RUN — agrega --apply para aplicar cambios ===\n'
    : '\n=== APLICANDO CAMBIOS ===\n');

  // ── 1. Consecutivos con prefijo REQ- ─────────────────────────
  sep('1 · Consecutivos con prefijo REQ-');

  const [conPrefijo] = await pool.query(`
    SELECT id, consecutivo
    FROM requerimientos
    WHERE consecutivo LIKE 'REQ-%'
    ORDER BY id ASC
  `);

  console.log(`Encontrados: ${conPrefijo.length}`);

  if (conPrefijo.length) {
    console.log('\nID       Actual              → Nuevo');
    console.log('──────   ──────────────────   ──────────────────');
    for (const r of conPrefijo) {
      const nuevo = r.consecutivo.replace(/^REQ-/i, '');
      console.log(`${String(r.id).padEnd(8)} ${r.consecutivo.padEnd(20)} → ${nuevo}`);
    }

    if (!DRY_RUN) {
      for (const r of conPrefijo) {
        const nuevo = r.consecutivo.replace(/^REQ-/i, '');
        await pool.query(
          'UPDATE requerimientos SET consecutivo = ? WHERE id = ?',
          [nuevo, r.id]
        );
      }
      console.log(`\nActualizados: ${conPrefijo.length} consecutivos`);
    }
  }

  // ── 2. Reqs con OC pero sin orden_compra_id asignado ─────────
  sep('2 · Reqs con OC existente pero orden_compra_id no asignado');

  const [sinVincular] = await pool.query(`
    SELECT
      r.id            AS req_id,
      r.consecutivo,
      r.estado,
      r.orden_compra_id,
      oc.id           AS oc_id,
      oc.numero_oc,
      oc.estado       AS oc_estado
    FROM requerimientos r
    JOIN ordenes_compra oc ON oc.requerimiento_id = r.id
    WHERE r.orden_compra_id IS NULL
    ORDER BY r.id ASC
  `);

  console.log(`Encontrados: ${sinVincular.length}`);

  if (sinVincular.length) {
    console.log('\nREQ ID   Consecutivo         OC ID   Num OC              OC Estado');
    console.log('──────   ──────────────────   ─────   ──────────────────   ─────────');
    for (const r of sinVincular) {
      console.log(
        `${String(r.req_id).padEnd(8)} ${(r.consecutivo||'').padEnd(20)} ` +
        `${String(r.oc_id).padEnd(7)} ${(r.numero_oc||'').padEnd(20)} ${r.oc_estado}`
      );
    }

    if (!DRY_RUN) {
      for (const r of sinVincular) {
        await pool.query(
          'UPDATE requerimientos SET orden_compra_id = ? WHERE id = ?',
          [r.oc_id, r.req_id]
        );
      }
      console.log(`\nVinculados: ${sinVincular.length} requerimientos`);
    }
  }

  // ── 3. Reqs con OC que siguen en "aprobado" ───────────────────
  sep('3 · Reqs con OC que aún están en estado "aprobado"');

  const [abiertosConOC] = await pool.query(`
    SELECT
      r.id        AS req_id,
      r.consecutivo,
      r.estado,
      oc.id       AS oc_id,
      oc.numero_oc,
      oc.estado   AS oc_estado
    FROM requerimientos r
    JOIN ordenes_compra oc ON oc.requerimiento_id = r.id
    WHERE r.estado = 'aprobado'
    ORDER BY r.id ASC
  `);

  console.log(`Encontrados: ${abiertosConOC.length}`);

  if (abiertosConOC.length) {
    console.log('\nREQ ID   Consecutivo         OC Num              OC Estado   → Nuevo estado REQ');
    console.log('──────   ──────────────────   ──────────────────   ─────────   ──────────────────');
    for (const r of abiertosConOC) {
      console.log(
        `${String(r.req_id).padEnd(8)} ${(r.consecutivo||'').padEnd(20)} ` +
        `${(r.numero_oc||'').padEnd(20)} ${r.oc_estado.padEnd(11)} → cerrado`
      );
    }

    if (!DRY_RUN) {
      for (const r of abiertosConOC) {
        await pool.query(
          `UPDATE requerimientos SET estado = 'cerrado', orden_compra_id = ? WHERE id = ?`,
          [r.oc_id, r.req_id]
        );
        // Registrar en historial
        await pool.query(`
          INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
          VALUES ('requerimiento', ?, 'aprobado', 'cerrado', 1, 'Cierre automático — OC ya existía al momento de la corrección histórica')
        `, [r.req_id]);
      }
      console.log(`\nCerrados: ${abiertosConOC.length} requerimientos`);
    }
  }

  // ── Resumen ───────────────────────────────────────────────────
  sep('Resumen');
  console.log(`Consecutivos a corregir:          ${conPrefijo.length}`);
  console.log(`Reqs a vincular con su OC:        ${sinVincular.length}`);
  console.log(`Reqs a cerrar (tenian OC abierta): ${abiertosConOC.length}`);
  if (DRY_RUN) {
    console.log('\nDRY-RUN — ningún cambio aplicado.');
    console.log('Ejecuta con --apply para aplicar.');
  } else {
    console.log('\nTodos los cambios aplicados correctamente.');
  }

  await pool.end();
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
