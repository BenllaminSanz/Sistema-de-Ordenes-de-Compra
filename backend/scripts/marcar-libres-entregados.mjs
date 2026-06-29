/**
 * Migración: OC cerradas con ítems libres sin recepción registrada.
 * Para cada ítem libre sin cobertura en recepcion_items, inserta una entrada
 * marcando cantidad_recibida = cantidad_solicitada en la última recepción de esa OC.
 *
 * Uso:
 *   node backend/scripts/marcar-libres-entregados.mjs          → dry-run (solo muestra)
 *   node backend/scripts/marcar-libres-entregados.mjs --apply  → aplica cambios
 */

import pool from '../src/config/db.js';

const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  const conn = await pool.getConnection();
  try {
    console.log(DRY_RUN
      ? '\n=== DRY-RUN (sin cambios) — agrega --apply para aplicar ===\n'
      : '\n=== APLICANDO CAMBIOS ===\n');

    if (!DRY_RUN) await conn.beginTransaction();

    const [ocRows] = await conn.query(`
      SELECT DISTINCT oc.id, oc.numero_oc, oc.requerimiento_id
      FROM ordenes_compra oc
      WHERE oc.estado = 'cerrada'
        AND EXISTS (
          SELECT 1 FROM requerimiento_items_libres ril
          WHERE ril.requerimiento_id = oc.requerimiento_id
        )
      ORDER BY oc.id ASC
    `);

    if (!ocRows.length) {
      console.log('No se encontraron OC cerradas con ítems libres sin cobertura.');
      return;
    }

    console.log(`OC cerradas con ítems libres encontradas: ${ocRows.length}\n`);

    let totalInserted = 0;
    let totalSkipped  = 0;
    let totalSinRec   = 0;

    for (const oc of ocRows) {
      const [libItems] = await conn.query(`
        SELECT id, descripcion, cantidad, unidad
        FROM requerimiento_items_libres
        WHERE requerimiento_id = ?
        ORDER BY id ASC
      `, [oc.requerimiento_id]);

      const [[rec]] = await conn.query(`
        SELECT id FROM recepciones
        WHERE orden_compra_id = ?
        ORDER BY id DESC LIMIT 1
      `, [oc.id]);

      if (!rec) {
        console.log(`  ⚠ OC ${oc.numero_oc}: sin recepciones — saltando`);
        totalSinRec++;
        continue;
      }

      let ocPendientes = 0;
      for (const item of libItems) {
        const itemKey = `lib-${item.id}`;

        const [[existing]] = await conn.query(`
          SELECT ri.id FROM recepcion_items ri
          JOIN recepciones r ON r.id = ri.recepcion_id
          WHERE r.orden_compra_id = ? AND ri.item_key = ?
          LIMIT 1
        `, [oc.id, itemKey]);

        if (existing) { totalSkipped++; continue; }

        ocPendientes++;
        console.log(`  [${DRY_RUN ? 'DRY' : 'OK'}] OC ${oc.numero_oc} → recepcion ${rec.id}: "${item.descripcion}" ${item.cantidad} ${item.unidad || ''}`);

        if (!DRY_RUN) {
          await conn.query(`
            INSERT INTO recepcion_items
              (recepcion_id, item_key, descripcion, codigo, cantidad_solicitada, cantidad_recibida, unidad)
            VALUES (?, ?, ?, NULL, ?, ?, ?)
          `, [rec.id, itemKey, item.descripcion, item.cantidad, item.cantidad, item.unidad || null]);
        }
        totalInserted++;
      }

      if (ocPendientes === 0) {
        console.log(`  ✓ OC ${oc.numero_oc}: todos los ítems ya tenían cobertura`);
      }
    }

    if (!DRY_RUN) await conn.commit();

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Ítems a insertar/insertados: ${totalInserted}`);
    console.log(`Ítems ya con cobertura:      ${totalSkipped}`);
    if (totalSinRec) console.log(`OC sin recepciones:          ${totalSinRec}`);
    if (DRY_RUN && totalInserted > 0) {
      console.log('\nPara aplicar ejecuta:');
      console.log('  node backend/scripts/marcar-libres-entregados.mjs --apply\n');
    } else if (!DRY_RUN) {
      console.log('\n✓ Migración aplicada correctamente.\n');
    }
  } catch (err) {
    if (!DRY_RUN) await conn.rollback();
    console.error('\nError — cambios revertidos:', err.message || err);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
