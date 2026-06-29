/**
 * Importa requerimientos históricos desde "Requerimientos 2026.xlsx"
 * Procesa SOLO las hojas SERVICIOS y PARTES.
 *
 * Colores Excel:
 *   Rosa  (E59EDD / theme:8) → aprobado  + OC cerrada (ya deben existir en BD)
 *   Verde (B4E5A2 / theme:9) → aprobado  + OC activa  (ya deben existir en BD)
 *   Amarillo (FFFF00)        → rechazado              (ya deben existir en BD)
 *   Blanco / sin relleno     → borrador               ← estos se importan aquí
 *
 * Uso:
 *   node backend/scripts/importar-historico-req.mjs          → dry-run
 *   node backend/scripts/importar-historico-req.mjs --apply  → aplica
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
import pool from '../src/config/db.js';

const DRY_RUN = !process.argv.includes('--apply');

// ── Helpers ─────────────────────────────────────────────────────────────
function excelDateToISO(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(Math.round((v - 25569) * 86400 * 1000));
  return d.toISOString().split('T')[0];
}

function clasificarColor(cell) {
  const s = cell?.s;
  if (!s) return 'blanco';
  const pt = s.patternType;
  if (!pt || pt === 'none') return 'blanco';

  const fg = s.fgColor;
  if (!fg) return 'blanco';

  const rgb = (fg.rgb || '').toUpperCase();

  // Verde: theme 9 o canal verde dominante
  if (fg.theme === 9) return 'verde';
  if (rgb === 'B4E5A2') return 'verde';
  if (rgb.length === 6) {
    const r = parseInt(rgb.slice(0, 2), 16);
    const g = parseInt(rgb.slice(2, 4), 16);
    const b = parseInt(rgb.slice(4, 6), 16);
    if (g > r && g > b && g > 100) return 'verde';
  }

  // Amarillo
  if (rgb === 'FFFF00') return 'amarillo';

  // Rosa: theme 8 o E59EDD
  if (fg.theme === 8) return 'rosa';
  if (rgb === 'E59EDD') return 'rosa';
  if (rgb.length === 6) {
    const r = parseInt(rgb.slice(0, 2), 16);
    const g = parseInt(rgb.slice(2, 4), 16);
    const b = parseInt(rgb.slice(4, 6), 16);
    if ((r > g && r > b) || (r > 150 && b > 150 && g < 180)) return 'rosa';
  }

  return 'otro';
}

// Mapeo de estado según color Excel
const COLOR_A_ESTADO = {
  rosa:     'aprobado',
  verde:    'aprobado',
  amarillo: 'rechazado',
  blanco:   'borrador',
  otro:     'borrador',
};

// ── Matching de usuario por nombre parcial ───────────────────────────────
function buildMatchUsuario(dbUsers) {
  const byFull  = new Map(dbUsers.map(u => [u.nombre.toLowerCase(), u.id]));
  return function matchUsuario(excelNombre) {
    if (!excelNombre) return null;
    const lower = excelNombre.toLowerCase().trim();
    if (byFull.has(lower)) return byFull.get(lower);
    // Intenta con primeras 2 palabras
    const tokens = lower.split(/\s+/);
    if (tokens.length > 2) {
      const dos = tokens.slice(0, 2).join(' ');
      if (byFull.has(dos)) return byFull.get(dos);
      for (const [k, v] of byFull.entries()) {
        if (lower.includes(k.split(' ')[0]) && lower.includes((k.split(' ')[1] || ''))) return v;
        if (k.includes(tokens[0]) && k.includes(tokens[1])) return v;
      }
    }
    return null;
  };
}

// ── Leer Excel ───────────────────────────────────────────────────────────
console.log(DRY_RUN
  ? '\n=== DRY-RUN (sin cambios) — agrega --apply para aplicar ===\n'
  : '\n=== APLICANDO CAMBIOS ===\n');

const wb = XLSX.readFile('Requerimientos 2026.xlsx', { cellStyles: true });
const SHEETS = ['SERVICIOS', 'PARTES'];

const filasExcel = [];

for (const sheetName of SHEETS) {
  const ws = wb.Sheets[sheetName];
  if (!ws?.['!ref']) continue;
  const data  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const range = XLSX.utils.decode_range(ws['!ref']);

  for (let r = 1; r <= range.e.r; r++) {
    const row = data[r];
    if (!row || !row[0]) continue;

    const cell  = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    const color = clasificarColor(cell);

    // Ignorar filas sin datos reales (solo número pre-relleno, resto vacío)
    const tieneData = row[1] || row[2] || row[3] || row[5] || row[6];
    if (!tieneData) continue;

    filasExcel.push({
      hoja:        sheetName,
      consecutivo: String(row[0]).trim(),
      fecha_sol:   excelDateToISO(row[1]),
      proveedor:   String(row[2] || '').trim(),
      area:        String(row[3] || '').trim(),
      notas:       String(row[5] || '').trim(),
      usuario:     String(row[6] || '').trim(),
      oc_numero:   row[8] ? String(row[8]).trim() : '',
      total:       row[10] !== '' ? parseFloat(row[10]) || null : null,
      moneda:      String(row[11] || 'MXN').trim() || 'MXN',
      color,
      estado:      COLOR_A_ESTADO[color] || 'borrador',
    });
  }
}

console.log(`Total filas en Excel (SERVICIOS+PARTES): ${filasExcel.length}`);
const colorResumen = {};
filasExcel.forEach(f => { colorResumen[f.color] = (colorResumen[f.color] || 0) + 1; });
console.log('Distribución de colores:', colorResumen);

// ── Cargar BD ────────────────────────────────────────────────────────────
const conn = await pool.getConnection();

const [dbUsers] = await conn.query('SELECT id, nombre FROM usuarios');
const [dbReqs]  = await conn.query('SELECT consecutivo FROM requerimientos');
const [adminUser] = await conn.query("SELECT id FROM usuarios WHERE rol='admin' LIMIT 1");

const matchUsuario = buildMatchUsuario(dbUsers);
const dbReqSet     = new Set(dbReqs.map(r => r.consecutivo));
const adminId      = adminUser[0]?.id;

// ── Filtrar solo nuevas filas ────────────────────────────────────────────
const nuevas = filasExcel.filter(f =>
  !dbReqSet.has(f.consecutivo) && !dbReqSet.has('REQ-' + f.consecutivo)
);

console.log(`\nReqs ya en BD:         ${filasExcel.length - nuevas.length}`);
console.log(`Reqs a importar:       ${nuevas.length}`);

if (!nuevas.length) {
  console.log('\n✓ No hay registros nuevos que importar.');
  conn.release();
  await pool.end();
  process.exit(0);
}

// ── Detalles de las filas a importar ────────────────────────────────────
console.log('\nDetalle de registros a importar:');
nuevas.forEach(f => {
  const uid = matchUsuario(f.usuario);
  console.log(`  [${f.color.padEnd(8)}] ${f.hoja} ${f.consecutivo.padEnd(14)} | ${f.estado.padEnd(10)} | usuario: ${f.usuario || '(vacío)'} → id:${uid ?? 'NO MATCH'} | area: ${f.area}`);
});

// ── Verificar usuarios sin match ─────────────────────────────────────────
const sinMatch = nuevas.filter(f => f.usuario && !matchUsuario(f.usuario));
if (sinMatch.length) {
  console.warn(`\n⚠ ${sinMatch.length} fila(s) sin usuario match — se usará admin (id:${adminId}):`);
  sinMatch.forEach(f => console.warn(`   ${f.consecutivo}: "${f.usuario}"`));
}

if (DRY_RUN) {
  console.log('\nPara aplicar ejecuta:');
  console.log('  node backend/scripts/importar-historico-req.mjs --apply\n');
  conn.release();
  await pool.end();
  process.exit(0);
}

// ── Insertar ─────────────────────────────────────────────────────────────
try {
  await conn.beginTransaction();

  let insertados = 0;

  for (const f of nuevas) {
    const solicitanteId = matchUsuario(f.usuario) ?? adminId;
    const titulo        = f.notas || f.consecutivo;
    const notas         = f.notas || '';
    const area          = f.area  || null;
    const createdAt     = f.fecha_sol ? `${f.fecha_sol} 00:00:00` : null;

    await conn.query(`
      INSERT INTO requerimientos
        (consecutivo, solicitante_id, titulo_solicitud, area, notas,
         requiere_cotizacion, estado, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, NOW())
    `, [
      f.consecutivo,
      solicitanteId,
      titulo.slice(0, 500),
      area,
      notas.slice(0, 2000),
      f.estado,
      createdAt,
    ]);

    insertados++;
    console.log(`  ✓ ${f.consecutivo} → ${f.estado}`);
  }

  await conn.commit();
  console.log(`\n✓ ${insertados} requerimientos importados correctamente.\n`);
} catch (err) {
  await conn.rollback();
  console.error('\nError — cambios revertidos:', err.message || err);
  process.exit(1);
} finally {
  conn.release();
  await pool.end();
}
