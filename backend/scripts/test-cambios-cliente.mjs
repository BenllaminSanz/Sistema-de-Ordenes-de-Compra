/**
 * Pruebas de los cambios recientes (REQ, catálogo, proveedor, consecutivo).
 * Uso: node backend/scripts/test-cambios-cliente.mjs
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../src/config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const BASE = process.env.API_BASE || 'http://localhost:3000/api';
let ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL) {
  const [[adminRow]] = await pool.query(
    "SELECT email FROM usuarios WHERE rol = 'admin' AND activo = 1 LIMIT 1"
  );
  ADMIN_EMAIL = adminRow?.email;
}

let token = null;
const resultados = [];

function ok(n, d = '') { resultados.push(['OK', n, d]); console.log(`  ✅ ${n}${d ? ` — ${d}` : ''}`); }
function fail(n, d = '') { resultados.push(['FAIL', n, d]); console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`); }
function warn(n, d = '') { resultados.push(['WARN', n, d]); console.log(`  ⚠️  ${n}${d ? ` — ${d}` : ''}`); }

async function api(method, path, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

console.log('\n=== Pruebas cambios cliente v1.2+ ===\n');

// ── Archivos frontend ─────────────────────────────────────────
const fs = await import('fs');
const root = path.resolve(__dirname, '../..');
const archivos = [
  'frontend/js/proveedor-busqueda.js',
  'frontend/catalogo-proveedores.html',
  'frontend/js/pages/catalogo-proveedores.js',
  'frontend/img/topLogoParkdale.png',
  'backend/src/utils/emailBranding.js',
];
for (const f of archivos) {
  if (fs.existsSync(path.join(root, f))) ok(`Archivo ${f}`);
  else fail(`Archivo ${f}`, 'no encontrado');
}

// ── Login ─────────────────────────────────────────────────────
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  fail('Login', 'Falta email de admin (BD/.env) o ADMIN_PASSWORD en .env');
  await pool.end();
  process.exit(1);
}

const login = await api('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, false);
if (login.status === 200 && login.data?.token) {
  token = login.data.token;
  ok('Login admin', login.data.usuario?.rol);
} else {
  fail('Login admin', `${login.status} ${JSON.stringify(login.data)}`);
  await pool.end();
  process.exit(1);
}

// ── 1. REQ vacío rechazado ────────────────────────────────────
const [[sampleReq]] = await pool.query(
  'SELECT area, departamento FROM requerimientos WHERE area IS NOT NULL AND departamento IS NOT NULL LIMIT 1'
);
const areaSample = sampleReq?.area || 'ADMINISTRACION';
const deptoSample = sampleReq?.departamento || 'COMPRAS';

const vacio = await api('POST', '/requerimientos', {
  titulo_solicitud: 'Prueba REQ vacío automatizado',
  tipo: 'SERVICIOS',
  area: areaSample,
  departamento: deptoSample,
  notas: 'Solo notas sin items',
  items: [],
  items_libres: [],
});
if (vacio.status === 400 && String(vacio.data?.mensaje || '').includes('ítem')) {
  ok('REQ vacío bloqueado', vacio.data.mensaje.slice(0, 60) + '…');
} else {
  fail('REQ vacío bloqueado', `status=${vacio.status} ${JSON.stringify(vacio.data)}`);
}

// ── 2. Consecutivo con año y tipo ─────────────────────────────
const [[itemCat]] = await pool.query(`
  SELECT c.id, c.tipo, c.proveedor_id
  FROM catalogo c
  WHERE c.activo = 1 AND c.proveedor_id IS NOT NULL
  LIMIT 1
`);

if (!itemCat) {
  warn('Consecutivo formato', 'sin ítem de catálogo con proveedor para crear REQ de prueba');
} else {
  const tipo = itemCat.tipo === 'PARTES' ? 'PARTES' : 'SERVICIOS';
  const letra = tipo === 'PARTES' ? 'P' : 'S';
  const anio = new Date().getFullYear();

  const crear = await api('POST', '/requerimientos', {
    titulo_solicitud: 'Prueba consecutivo automatizado v12',
    tipo,
    area: areaSample,
    departamento: deptoSample,
    notas: 'REQ de prueba — puede eliminarse',
    items: [{ catalogo_id: itemCat.id, cantidad: 1 }],
    items_libres: [],
  });

  if (crear.status === 201 && crear.data?.consecutivo) {
    const c = crear.data.consecutivo;
    const patron = new RegExp(`^${anio}${letra}-\\d{3}$`);
    if (patron.test(c)) {
      ok('Consecutivo formato', c);
    } else {
      fail('Consecutivo formato', `esperado ${anio}${letra}-NNN, obtuvo ${c}`);
    }

    // Limpiar: borrar borrador de prueba si existe endpoint delete
    const del = await api('DELETE', `/requerimientos/${crear.data.id}`);
    if (del.status === 200 || del.status === 204) ok('Limpieza REQ prueba', `id=${crear.data.id}`);
    else warn('Limpieza REQ prueba', `no se pudo borrar (${del.status})`);
  } else {
    fail('Crear REQ prueba', `${crear.status} ${JSON.stringify(crear.data)}`);
  }
}

// ── 3. proveedor_seleccionado en detalle ──────────────────────
const [[reqConCot]] = await pool.query(`
  SELECT r.id FROM requerimientos r
  JOIN cotizaciones c ON c.requerimiento_id = r.id AND (c.seleccionada = 1 OR c.estado = 'seleccionada')
  LIMIT 1
`);
if (reqConCot) {
  const det = await api('GET', `/requerimientos/${reqConCot.id}`);
  if (det.status === 200 && det.data?.proveedor_seleccionado?.proveedor_id) {
    ok('proveedor_seleccionado en API', UI_label(det.data.proveedor_seleccionado));
  } else {
    fail('proveedor_seleccionado en API', JSON.stringify(det.data?.proveedor_seleccionado));
  }
} else {
  warn('proveedor_seleccionado', 'no hay REQ con cotización seleccionada en BD');
}

function UI_label(p) {
  const n = p.proveedor_nombre || p.nombre || '';
  const num = p.proveedor_num || p.num_proveedor || '';
  return num ? `${num} — ${n}` : n || '?';
}

// ── 4. Cancelar aprobado sin OC (transición) ──────────────────
const [[reqAprob]] = await pool.query(`
  SELECT r.id, r.estado FROM requerimientos r
  WHERE r.estado = 'aprobado' AND r.orden_compra_id IS NULL
  LIMIT 1
`);
if (reqAprob) {
  // Solo verificar que la transición está permitida (sin modificar datos reales)
  const det = await api('GET', `/requerimientos/${reqAprob.id}`);
  if (det.status === 200 && det.data?.estado === 'aprobado' && !det.data?.orden_compra_id && !det.data?.oc_id) {
    ok('REQ aprobado sin OC disponible para cancelar', `id=${reqAprob.id} (${det.data.consecutivo})`);
    warn('Cancelar REQ aprobado', 'transición no ejecutada para no alterar datos — probar manualmente en UI');
  } else {
    fail('REQ aprobado sin OC', JSON.stringify(det.data));
  }
} else {
  warn('Cancelar REQ aprobado', 'no hay REQ aprobado sin OC en BD');
}

// ── 5. Proveedores API para búsqueda ──────────────────────────
const provs = await api('GET', '/proveedores?activos=true');
if (provs.status === 200 && Array.isArray(provs.data) && provs.data.length) {
  const p = provs.data[0];
  ok('Proveedores activos', `${provs.data.length} — ejemplo ${p.num_proveedor} ${p.nombre}`);
} else {
  fail('Proveedores activos', `status=${provs.status}`);
}

// ── 6. Catálogo por proveedor_id ──────────────────────────────
if (itemCat?.proveedor_id) {
  const cat = await api('GET', `/catalogo?proveedor_id=${itemCat.proveedor_id}&soloActivos=true`);
  if (cat.status === 200 && Array.isArray(cat.data) && cat.data.length) {
    ok('Catálogo filtro proveedor_id', `${cat.data.length} ítems`);
  } else {
    fail('Catálogo filtro proveedor_id', `status=${cat.status}`);
  }
}

// ── Resumen ───────────────────────────────────────────────────
const fails = resultados.filter((r) => r[0] === 'FAIL').length;
const oks = resultados.filter((r) => r[0] === 'OK').length;
const warns = resultados.filter((r) => r[0] === 'WARN').length;

console.log(`\n--- Resumen: ${oks} OK, ${warns} WARN, ${fails} FAIL ---\n`);

await pool.end();
process.exit(fails > 0 ? 1 : 0);