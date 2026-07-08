/**
 * Migra requerimientos.consecutivo a numeración densa y cronológica por (año, tipo),
 * resincroniza ordenes_compra.numero_oc y siembra consecutivos_control.
 * Ver backend/scripts/002_migrar_consecutivos.sql para el detalle de cada paso.
 *
 * Uso:
 *   node backend/scripts/migrar-consecutivos.mjs          → dry-run
 *   node backend/scripts/migrar-consecutivos.mjs --apply  → aplica cambios
 */

import pool from '../src/config/db.js';

const DRY_RUN = !process.argv.includes('--apply');

function sep(titulo) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  ${titulo}`);
  console.log('─'.repeat(70));
}

async function main() {
  console.log(DRY_RUN
    ? '\n=== DRY-RUN — agrega --apply para aplicar cambios ===\n'
    : '\n=== APLICANDO MIGRACIÓN DE CONSECUTIVOS ===\n');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS consecutivos_control (
      anio          INT NOT NULL,
      tipo          ENUM('PARTES','SERVICIOS','FLETES') NOT NULL,
      ultimo_numero INT NOT NULL DEFAULT 0,
      PRIMARY KEY (anio, tipo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ── Vista previa: qué cambiaría por grupo (año, tipo) ──────────────────────
  sep('Vista previa por grupo (año, tipo)');

  const [preview] = await pool.query(`
    SELECT
      YEAR(created_at) AS anio,
      tipo,
      COUNT(*) AS total,
      MIN(consecutivo) AS min_actual_muestra,
      MAX(consecutivo) AS max_actual_muestra
    FROM requerimientos
    GROUP BY anio, tipo
    ORDER BY anio, tipo
  `);
  console.log('Año   Tipo         Filas   (muestra de valores actuales, no representativa del orden final)');
  console.log('────  ──────────   ─────   ────────────────────────────────────────────');
  for (const g of preview) {
    console.log(
      `${String(g.anio).padEnd(5)} ${g.tipo.padEnd(12)} ${String(g.total).padEnd(7)} ` +
      `${g.min_actual_muestra} … ${g.max_actual_muestra}`
    );
  }

  const [[{ totalFilas }]] = await pool.query('SELECT COUNT(*) AS totalFilas FROM requerimientos');
  console.log(`\nTotal de requerimientos a renumerar: ${totalFilas}`);

  // ── Caso anómalo conocido: created_at no coincide con el año del consecutivo viejo ──
  const [anomalos] = await pool.query(`
    SELECT id, tipo, consecutivo, created_at
    FROM requerimientos
    WHERE consecutivo REGEXP '^[0-9]{4}[A-Z]-'
      AND LEFT(consecutivo, 4) != YEAR(created_at)
  `);
  if (anomalos.length) {
    sep('Filas con año de created_at distinto al año de su consecutivo viejo');
    console.log('(se agrupan por YEAR(created_at), que es el criterio pedido)');
    for (const a of anomalos) {
      console.log(`  id=${a.id} tipo=${a.tipo} consecutivo_viejo=${a.consecutivo} created_at=${a.created_at.toISOString()}`);
    }
  }

  // ── Muestra de mapeo viejo → nuevo (10 filas) ───────────────────────────────
  sep('Muestra de mapeo consecutivo viejo → nuevo (10 filas)');

  const [muestraMapeo] = await pool.query(`
    SELECT
      r.id, r.tipo, r.consecutivo AS viejo, r.created_at,
      CONCAT(
        YEAR(r.created_at),
        CASE r.tipo WHEN 'PARTES' THEN 'P' WHEN 'SERVICIOS' THEN 'S' WHEN 'FLETES' THEN 'F' END,
        '-',
        (
          SELECT COUNT(*) FROM requerimientos r2
          WHERE r2.tipo = r.tipo AND YEAR(r2.created_at) = YEAR(r.created_at)
            AND (r2.created_at < r.created_at OR (r2.created_at = r.created_at AND r2.id <= r.id))
        )
      ) AS nuevo
    FROM requerimientos r
    ORDER BY r.created_at ASC, r.id ASC
    LIMIT 10
  `);
  for (const m of muestraMapeo) {
    console.log(`  id=${m.id.toString().padEnd(6)} ${m.tipo.padEnd(10)} ${m.viejo.padEnd(16)} → ${m.nuevo}`);
  }

  // ── Impacto en OC (numero_oc que cambiaría) ─────────────────────────────────
  const [[{ ocTotal }]] = await pool.query('SELECT COUNT(*) AS ocTotal FROM ordenes_compra');
  console.log(`\nTotal de OC cuyo numero_oc se resincronizará con el nuevo consecutivo: ${ocTotal}`);
  console.log('(numero_oc siempre es un espejo de requerimientos.consecutivo — ver generarNumeroOC en ordenes.js)');

  // ── Pre-flight: requerimientos con más de una OC (rompería la UNIQUE KEY de numero_oc) ──
  // La OC vinculada en requerimientos.orden_compra_id (o la de menor id si no hay ninguna
  // vinculada) recibe el consecutivo limpio; cualquier OC extra recibe un sufijo de letra
  // (mismo patrón que ya usaba el histórico para folios ambiguos, ej. 2026S-32A/32B).
  const [reqConMultiplesOC] = await pool.query(`
    SELECT oc.requerimiento_id, r.consecutivo, r.orden_compra_id, COUNT(*) AS n_oc,
           GROUP_CONCAT(oc.id ORDER BY oc.id) AS oc_ids,
           GROUP_CONCAT(oc.numero_oc ORDER BY oc.id) AS numeros_oc,
           GROUP_CONCAT(oc.estado ORDER BY oc.id) AS estados,
           GROUP_CONCAT(oc.created_at ORDER BY oc.id) AS fechas
    FROM ordenes_compra oc
    JOIN requerimientos r ON r.id = oc.requerimiento_id
    GROUP BY oc.requerimiento_id
    HAVING n_oc > 1
  `);
  if (reqConMultiplesOC.length) {
    sep('⚠️  Requerimientos con más de una OC — se desambiguará automáticamente');
    for (const r of reqConMultiplesOC) {
      console.log(`  requerimiento_id=${r.requerimiento_id} consecutivo=${r.consecutivo} (oficial: orden_compra_id=${r.orden_compra_id})`);
      console.log(`    OC ids:      ${r.oc_ids}`);
      console.log(`    numero_oc actual: ${r.numeros_oc}`);
      console.log(`    estados:     ${r.estados}`);
      console.log(`    created_at:  ${r.fechas}`);
    }
    console.log(`\n${reqConMultiplesOC.length} requerimiento(s) con múltiples OC — la OC oficial (orden_compra_id) recibirá`);
    console.log('el consecutivo limpio y las demás recibirán sufijo B, C, ... Revisa que esto sea correcto antes de --apply.');
  }

  if (DRY_RUN) {
    sep('DRY-RUN — ningún cambio aplicado');
    console.log('Ejecuta con --apply para aplicar la migración completa.');
    await pool.end();
    return;
  }

  // ── Aplicar ──────────────────────────────────────────────────────────────────
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query('DROP TEMPORARY TABLE IF EXISTS tmp_nuevos_consecutivos');
    await conn.query(`
      CREATE TEMPORARY TABLE tmp_nuevos_consecutivos AS
      SELECT
        r.id,
        CONCAT(
          YEAR(r.created_at),
          CASE r.tipo WHEN 'PARTES' THEN 'P' WHEN 'SERVICIOS' THEN 'S' WHEN 'FLETES' THEN 'F' END,
          '-',
          (
            SELECT COUNT(*) FROM requerimientos r2
            WHERE r2.tipo = r.tipo AND YEAR(r2.created_at) = YEAR(r.created_at)
              AND (r2.created_at < r.created_at OR (r2.created_at = r.created_at AND r2.id <= r.id))
          )
        ) AS nuevo_consecutivo
      FROM requerimientos r
    `);
    // Nota: NO se agrega PRIMARY KEY con ALTER TABLE — ALTER TABLE causa commit
    // implícito incluso sobre una tabla temporal y rompería la atomicidad de esta
    // transacción (confirmado empíricamente; CREATE/DROP TEMPORARY TABLE sí son seguros).

    await conn.query("UPDATE requerimientos SET consecutivo = CONCAT('TMP-', id)");
    await conn.query(`
      UPDATE requerimientos r
      JOIN tmp_nuevos_consecutivos t ON t.id = r.id
      SET r.consecutivo = t.nuevo_consecutivo
    `);

    await conn.query("UPDATE ordenes_compra SET numero_oc = CONCAT('TMP-', id)");

    // La OC "oficial" (requerimientos.orden_compra_id, o la de menor id si no hay ninguna
    // vinculada) recibe el consecutivo limpio; OC extra del mismo requerimiento (caso real
    // conocido: requerimiento 1729 con OC 1317 y 1318) recibe sufijo de letra B, C, ...
    // Se calcula en una tabla temporal porque MySQL no permite que un UPDATE lea de la
    // misma tabla que está actualizando dentro de una subconsulta correlacionada.
    await conn.query('DROP TEMPORARY TABLE IF EXISTS tmp_numero_oc_nuevo');
    await conn.query(`
      CREATE TEMPORARY TABLE tmp_numero_oc_nuevo AS
      SELECT
        oc.id,
        CASE
          WHEN oc.id = COALESCE(
            r.orden_compra_id,
            (SELECT MIN(oc0.id) FROM ordenes_compra oc0 WHERE oc0.requerimiento_id = oc.requerimiento_id)
          ) THEN r.consecutivo
          ELSE CONCAT(r.consecutivo, CHAR(66 + (
            SELECT COUNT(*) FROM ordenes_compra oc2
            WHERE oc2.requerimiento_id = oc.requerimiento_id
              AND oc2.id < oc.id
              AND oc2.id <> COALESCE(
                r.orden_compra_id,
                (SELECT MIN(oc1.id) FROM ordenes_compra oc1 WHERE oc1.requerimiento_id = oc.requerimiento_id)
              )
          )))
        END AS numero_oc_nuevo
      FROM ordenes_compra oc
      JOIN requerimientos r ON r.id = oc.requerimiento_id
    `);
    // (mismo motivo: sin ALTER TABLE sobre la temporal, para no romper la transacción)

    await conn.query(`
      UPDATE ordenes_compra oc
      JOIN tmp_numero_oc_nuevo t ON t.id = oc.id
      SET oc.numero_oc = t.numero_oc_nuevo
    `);

    await conn.query(`
      INSERT INTO consecutivos_control (anio, tipo, ultimo_numero)
      SELECT YEAR(created_at), tipo, COUNT(*)
      FROM requerimientos
      GROUP BY YEAR(created_at), tipo
      ON DUPLICATE KEY UPDATE ultimo_numero = VALUES(ultimo_numero)
    `);

    await conn.commit();
    console.log('\n✅ Migración aplicada y confirmada (COMMIT).');
  } catch (err) {
    await conn.rollback();
    console.error('\n❌ Error durante la migración — ROLLBACK aplicado.');
    throw err;
  } finally {
    conn.release();
  }

  // ── Verificación post-migración ─────────────────────────────────────────────
  sep('Verificación post-migración');

  const [dupReq] = await pool.query('SELECT consecutivo, COUNT(*) n FROM requerimientos GROUP BY consecutivo HAVING n > 1');
  console.log(`Consecutivos duplicados en requerimientos: ${dupReq.length}`);
  if (dupReq.length) console.log(dupReq);

  const [dupOc] = await pool.query('SELECT numero_oc, COUNT(*) n FROM ordenes_compra GROUP BY numero_oc HAVING n > 1');
  console.log(`numero_oc duplicados en ordenes_compra: ${dupOc.length}`);
  if (dupOc.length) console.log(dupOc);

  const [formatoInvalido] = await pool.query("SELECT id, consecutivo FROM requerimientos WHERE consecutivo NOT REGEXP '^[0-9]{4}[PSF]-[0-9]+$'");
  console.log(`Consecutivos con formato inválido: ${formatoInvalido.length}`);
  if (formatoInvalido.length) console.log(formatoInvalido);

  const [reinicio] = await pool.query(`
    SELECT anio, tipo, ultimo_numero,
      (SELECT COUNT(*) FROM requerimientos r WHERE YEAR(r.created_at) = cc.anio AND r.tipo = cc.tipo) AS conteo_real
    FROM consecutivos_control cc
    ORDER BY anio, tipo
  `);
  console.log('\nEstado final de consecutivos_control:');
  console.log('Año   Tipo         ultimo_numero   conteo_real   OK');
  console.log('────  ──────────   ─────────────   ───────────   ──');
  for (const r of reinicio) {
    const ok = r.ultimo_numero === r.conteo_real ? '✅' : '❌';
    console.log(`${String(r.anio).padEnd(5)} ${r.tipo.padEnd(12)} ${String(r.ultimo_numero).padEnd(15)} ${String(r.conteo_real).padEnd(13)} ${ok}`);
  }

  await pool.end();
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
