/**
 * Vincula historial de REQs de usuarios inactivos creados por import Excel
 * a los usuarios reales (activos) con nombre abreviado / correo corporativo.
 *
 * Uso:
 *   node backend/scripts/vincular-usuarios-import.mjs           # dry-run
 *   node backend/scripts/vincular-usuarios-import.mjs --apply   # aplica
 */
import '../src/config/env.js';
import pool from '../src/config/db.js';

const APPLY = process.argv.includes('--apply');

function normalizar(nombre) {
  return String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(nombre) {
  return normalizar(nombre)
    .split(' ')
    .filter((t) => t.length >= 3);
}

/** Puntuación: tokens del activo contenidos en el inactivo (o al revés). */
function scoreMatch(activoNombre, inactivoNombre) {
  const ta = tokens(activoNombre);
  const tb = tokens(inactivoNombre);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  const setA = new Set(ta);
  const inter = ta.filter((t) => setB.has(t));
  // Todos los tokens del nombre corto deben estar en el largo (o casi)
  const coberturaCorto = inter.length / ta.length;
  if (coberturaCorto < 1 && inter.length < 2) return 0;
  if (inter.length < 2 && ta.length > 1) return 0;
  // Preferir alta cobertura del nombre corto + más tokens compartidos
  return inter.length * 10 + coberturaCorto * 5 + (tb.length >= ta.length ? 1 : 0);
}

async function main() {
  const [usuarios] = await pool.query(`
    SELECT u.id, u.nombre, u.email, u.activo, u.rol,
      (SELECT COUNT(*) FROM requerimientos r WHERE r.solicitante_id = u.id) AS n_req
    FROM usuarios u
  `);

  const activos = usuarios.filter((u) => Number(u.activo) === 1 && u.rol === 'solicitante');
  const inactivosConHist = usuarios.filter(
    (u) => Number(u.activo) === 0 && Number(u.n_req) > 0
  );

  const pares = [];
  for (const inact of inactivosConHist) {
    let best = null;
    let bestScore = 0;
    for (const act of activos) {
      // Solo reasignar si el activo tiene 0 REQs o ya es el mismo historial
      if (Number(act.n_req) > 0 && act.id !== inact.id) continue;
      const s = scoreMatch(act.nombre, inact.nombre);
      if (s > bestScore) {
        bestScore = s;
        best = act;
      }
    }
    if (best && bestScore >= 20) {
      pares.push({ from: inact, to: best, score: bestScore });
    }
  }

  console.log(APPLY ? '=== APPLY ===' : '=== DRY-RUN (sin cambios) ===');
  if (!pares.length) {
    console.log('No hay pares a vincular.');
    await pool.end();
    return;
  }

  for (const p of pares) {
    console.log(
      `\n#${p.from.id} "${p.from.nombre}" (REQs=${p.from.n_req}, inactivo)`
      + `\n  → #${p.to.id} "${p.to.nombre}" (${p.to.email}, REQs actuales=${p.to.n_req})`
      + `\n  score=${p.score}`
    );
  }

  if (!APPLY) {
    console.log('\nEjecuta con --apply para reasignar los REQs al usuario activo.');
    await pool.end();
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let total = 0;
    for (const p of pares) {
      const [r] = await conn.query(
        'UPDATE requerimientos SET solicitante_id = ? WHERE solicitante_id = ?',
        [p.to.id, p.from.id]
      );
      total += r.affectedRows;
      console.log(`  reasignados ${r.affectedRows} REQ: ${p.from.id} → ${p.to.id}`);
    }
    await conn.commit();
    console.log(`\nOK. Total REQs reasignados: ${total}`);
  } catch (err) {
    await conn.rollback();
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
