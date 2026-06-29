/**
 * Analiza SERVICIOS y PARTES del Excel histórico y compara con la BD actual.
 * No modifica nada — solo reporta qué habría que importar.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
import pool from '../src/config/db.js';

// ── Helpers ─────────────────────────────────────────────────────
function excelDateToISO(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  const d = new Date(Math.round((v - 25569) * 86400 * 1000));
  return d.toISOString().split('T')[0];
}

function clasificarColor(cell) {
  // La estructura real de xlsx con cellStyles:true es cell.s.fgColor / cell.s.patternType
  const s = cell?.s;
  if (!s) return 'blanco';
  const pt = s.patternType;
  if (pt === 'none' || pt === undefined) return 'blanco';

  const fg = s.fgColor;
  if (!fg) return 'blanco';

  const rgb = (fg.rgb || '').toUpperCase();

  if (rgb.length === 6) {
    const r = parseInt(rgb.slice(0, 2), 16);
    const g = parseInt(rgb.slice(2, 4), 16);
    const b = parseInt(rgb.slice(4, 6), 16);
    if (g > r && g > b && g > 100) return 'verde';
    // Rosa: R dominante, O R y B ambos altos (magenta/lila)
    if (r > g && r > b) return 'rosa';
    if (r > 150 && b > 150 && g < 180) return 'rosa'; // lila/magenta
  }

  // Clasificación por tema Excel cuando no hay RGB o RGB es ambiguo
  if (fg.theme !== undefined) {
    // theme 8 = rosa/violeta (visto en PARTES), theme 9 = verde
    if (fg.theme === 9) return 'verde';
    if (fg.theme === 8 || fg.theme === 7) return 'rosa';
  }

  return `otro(rgb=${rgb}|theme=${fg.theme ?? '?'})`;
}

// ── Leer Excel ───────────────────────────────────────────────────
const wb = XLSX.readFile('Requerimientos 2026.xlsx', { cellStyles: true });
const SHEETS = ['SERVICIOS', 'PARTES'];

// Debug: cell raw de primeras 10 filas de cada hoja
for (const sheetName of SHEETS) {
  const ws = wb.Sheets[sheetName];
  if (!ws) continue;
  console.log(`\n── DEBUG ${sheetName} primeras 10 filas ──`);
  for (let r = 1; r <= 10; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!cell) continue;
    const s = cell.s;
    console.log(`  R${r+1}: v="${cell.v}" | pt="${s?.patternType}" | fg=${JSON.stringify(s?.fgColor)}`);
  }
}

const filas = [];

for (const sheetName of SHEETS) {
  const ws = wb.Sheets[sheetName];
  if (!ws?.['!ref']) continue;
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const range = XLSX.utils.decode_range(ws['!ref']);

  for (let r = 1; r <= range.e.r; r++) {
    const row = data[r];
    if (!row || !row[0]) continue;

    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    const color = clasificarColor(cell);

    filas.push({
      hoja:        sheetName,
      consecutivo: String(row[0]).trim(),
      fecha_sol:   excelDateToISO(row[1]),
      proveedor:   String(row[2] || '').trim(),
      area:        String(row[3] || '').trim(),
      notas:       String(row[5] || '').trim(),
      usuario:     String(row[6] || '').trim(),
      status_text: String(row[7] || '').trim(),
      oc_numero:   row[8] ? String(row[8]).trim() : '',
      oc_fecha:    excelDateToISO(row[9]),
      total:       row[10] !== '' ? parseFloat(row[10]) || null : null,
      moneda:      String(row[11] || 'MXN').trim() || 'MXN',
      color,
    });
  }
}

console.log(`\nTotal filas leídas: ${filas.length}`);

// ── Estadísticas de color ────────────────────────────────────────
const colorCounts = {};
filas.forEach(f => { colorCounts[f.color] = (colorCounts[f.color] || 0) + 1; });
console.log('\nDistribución de colores:', colorCounts);

for (const color of Object.keys(colorCounts)) {
  const ejs = filas.filter(f => f.color === color).slice(0, 3);
  console.log(`\nEjemplos [${color}]:`);
  ejs.forEach(f => console.log(`  ${f.hoja} ${f.consecutivo} | OC:${f.oc_numero||'-'} | ${f.proveedor?.slice(0,30)} | ${f.usuario}`));
}

// ── Valores únicos ────────────────────────────────────────────────
const usuarios = [...new Set(filas.map(f => f.usuario).filter(Boolean))].sort();
const provs    = [...new Set(filas.map(f => f.proveedor).filter(Boolean))].sort();

// ── Comparar con BD ──────────────────────────────────────────────
const [dbUsers] = await pool.query('SELECT id, nombre FROM usuarios');
const [dbProvs] = await pool.query('SELECT id, nombre FROM proveedores');
const [dbReqs]  = await pool.query('SELECT consecutivo FROM requerimientos');

const dbUserMap = new Map(dbUsers.map(u => [u.nombre.toLowerCase().trim(), u.id]));
const dbProvSet = new Set(dbProvs.map(p => p.nombre.toLowerCase().trim()));
const dbReqSet  = new Set(dbReqs.map(r => r.consecutivo));

// Matching parcial de usuarios: toma los primeros dos tokens del nombre Excel
function matchUsuario(excelNombre) {
  const lower = excelNombre.toLowerCase().trim();
  if (dbUserMap.has(lower)) return dbUserMap.get(lower);
  // intenta con 2 palabras
  const tokens = lower.split(/\s+/);
  if (tokens.length > 2) {
    const dos = tokens.slice(0, 2).join(' ');
    if (dbUserMap.has(dos)) return dbUserMap.get(dos);
    // busca por primer apellido en el mapa
    for (const [k, v] of dbUserMap.entries()) {
      if (lower.includes(k.split(' ')[0]) && lower.includes(k.split(' ').slice(-1)[0])) return v;
      if (k.includes(tokens[0]) && k.includes(tokens[1])) return v;
    }
  }
  return null;
}

const usuariosSinMatch = usuarios.filter(u => !matchUsuario(u));
const provsNuevos      = provs.filter(p => p && !dbProvSet.has(p.toLowerCase()));

const consExistentes = filas.filter(f =>
  dbReqSet.has('REQ-' + f.consecutivo) || dbReqSet.has(f.consecutivo));
const consNuevos = filas.filter(f =>
  !dbReqSet.has('REQ-' + f.consecutivo) && !dbReqSet.has(f.consecutivo));

console.log(`\n── Comparación con BD ──────────────────────────────`);
console.log(`Reqs en Excel:        ${filas.length}`);
console.log(`Ya en BD:             ${consExistentes.length}`);
console.log(`Nuevos a importar:    ${consNuevos.length}`);
console.log(`  → rosa (cerradas):   ${consNuevos.filter(f=>f.color==='rosa').length}`);
console.log(`  → verde (activas):   ${consNuevos.filter(f=>f.color==='verde').length}`);
console.log(`  → blanco (borrador): ${consNuevos.filter(f=>f.color==='blanco').length}`);
console.log(`  → otro color:        ${consNuevos.filter(f=>!['rosa','verde','blanco'].includes(f.color)).length}`);

console.log(`\nUsuarios sin match (${usuariosSinMatch.length}):`, usuariosSinMatch);
console.log(`Proveedores nuevos (${provsNuevos.length}):`, provsNuevos.slice(0, 12));
if (provsNuevos.length > 12) console.log(`  ... y ${provsNuevos.length - 12} más`);

const conOC = consNuevos.filter(f => f.oc_numero);
console.log(`\nNuevos con nº OC:    ${conOC.length}`);
if (conOC.length) {
  console.log('Ej:', conOC.slice(0, 5).map(f =>
    `${f.consecutivo}→OC${f.oc_numero}($${f.total} ${f.moneda})`).join(', '));
}

await pool.end();
