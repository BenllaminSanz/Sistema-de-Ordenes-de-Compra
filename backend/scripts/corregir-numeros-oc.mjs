/**
 * Corrige el numero_oc de las OC históricas para que coincida con el
 * consecutivo del requerimiento de origen (sin prefijo REQ-).
 *
 * Uso:
 *   node backend/scripts/corregir-numeros-oc.mjs          → dry-run (solo muestra)
 *   node backend/scripts/corregir-numeros-oc.mjs --apply  → aplica cambios
 */

import pool from '../src/config/db.js';

const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  console.log(DRY_RUN
    ? '\n=== DRY-RUN (sin cambios) — agrega --apply para aplicar ===\n'
    : '\n=== APLICANDO CAMBIOS ===\n');

  const [rows] = await pool.query(`
    SELECT
      oc.id,
      oc.numero_oc            AS numero_actual,
      oc.estado,
      r.consecutivo           AS req_consecutivo
    FROM ordenes_compra oc
    JOIN requerimientos r ON r.id = oc.requerimiento_id
    ORDER BY oc.id ASC
  `);

  if (!rows.length) {
    console.log('No hay OC vinculadas a requerimientos.');
    await pool.end();
    return;
  }

  const correcciones = rows
    .map(row => ({
      ...row,
      numero_correcto: (row.req_consecutivo || '').replace(/^REQ-/i, ''),
    }))
    .filter(row => row.numero_actual !== row.numero_correcto);

  console.log(`Total OC con requerimiento:  ${rows.length}`);
  console.log(`OC que necesitan corrección: ${correcciones.length}\n`);

  if (!correcciones.length) {
    console.log('✅ Todos los números de OC ya coinciden con el consecutivo del REQ.');
    await pool.end();
    return;
  }

  // Mostrar tabla de correcciones
  console.log('ID OC  │ Número actual          │ Número correcto        │ Estado');
  console.log('───────┼────────────────────────┼────────────────────────┼────────────');
  for (const c of correcciones) {
    const id  = String(c.id).padEnd(6);
    const act = (c.numero_actual   || '').padEnd(22);
    const cor = (c.numero_correcto || '').padEnd(22);
    console.log(`${id} │ ${act} │ ${cor} │ ${c.estado}`);
  }
  console.log();

  if (DRY_RUN) {
    console.log('🔍 Modo dry-run — ningún cambio aplicado.');
    await pool.end();
    return;
  }

  // Aplicar correcciones
  let ok = 0;
  let errores = 0;
  for (const c of correcciones) {
    try {
      await pool.query(
        'UPDATE ordenes_compra SET numero_oc = ? WHERE id = ?',
        [c.numero_correcto, c.id]
      );
      console.log(`✅ OC ${c.id}: "${c.numero_actual}" → "${c.numero_correcto}"`);
      ok++;
    } catch (err) {
      console.error(`❌ OC ${c.id}: error — ${err.message}`);
      errores++;
    }
  }

  console.log(`\n=== Completado: ${ok} actualizadas, ${errores} errores ===`);
  await pool.end();
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
