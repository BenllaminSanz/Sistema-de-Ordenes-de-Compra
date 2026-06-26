/**
 * Prueba rápida del flujo API — buscar errores en endpoints clave.
 * Uso: node scripts/test-flujo.mjs
 */
import pool from '../src/config/db.js';

const BASE = process.env.API_BASE || 'http://localhost:3000/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jebesari48@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TuNuevoPassword123!';

const resultados = [];
let token = null;

function ok(nombre, detalle = '') {
  resultados.push({ estado: 'OK', nombre, detalle });
  console.log(`  ✅ ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}
function fail(nombre, detalle = '') {
  resultados.push({ estado: 'FAIL', nombre, detalle });
  console.log(`  ❌ ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}
function warn(nombre, detalle = '') {
  resultados.push({ estado: 'WARN', nombre, detalle });
  console.log(`  ⚠️  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

async function api(method, path, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

async function login(email, password) {
  const { status, data } = await api('POST', '/auth/login', { email, password }, false);
  if (status === 200 && data?.token) {
    token = data.token;
    return data;
  }
  throw new Error(`Login falló (${status}): ${JSON.stringify(data)}`);
}

// ─── Tests ────────────────────────────────────────────────────
console.log('\n=== Prueba de flujo API ===\n');

// 1. Health
try {
  const { status, data } = await api('GET', '/health', null, false);
  if (status === 200 && data?.estado === 'ok') ok('Health check');
  else fail('Health check', `status=${status}`);
} catch (e) { fail('Health check', e.message); }

// 2. Login admin
try {
  const u = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  ok('Login admin', u.usuario?.rol);
} catch (e) {
  fail('Login admin', e.message);
  console.log('\nAbortando: sin token.\n');
  await pool.end();
  process.exit(1);
}

// 3. Dashboard stats
try {
  const { status, data } = await api('GET', '/dashboard/stats?anio=2026');
  if (status === 200 && Array.isArray(data?.estados_req)) {
    ok('Dashboard stats', `${data.estados_req.length} estados req`);
    if (!Array.isArray(data.aging_reqs)) warn('Dashboard', 'aging_reqs ausente');
    if (!Array.isArray(data.oc_sin_recibir)) warn('Dashboard', 'oc_sin_recibir ausente');
  } else fail('Dashboard stats', `status=${status}`);
} catch (e) { fail('Dashboard stats', e.message); }

// 4. OC activas
try {
  const { status, data } = await api('GET', '/ordenes-compra?estado=activas&limite=20');
  if (status === 200 && Array.isArray(data?.datos)) {
    ok('OC activas', `${data.total} total, ${data.datos.length} en página`);
    for (const o of data.datos) {
      if (['cerrada', 'cancelada'].includes(o.estado)) {
        fail('OC activas filtro', `${o.numero_oc} tiene estado ${o.estado}`);
      }
    }
  } else fail('OC activas', `status=${status}`);
} catch (e) { fail('OC activas', e.message); }

// 5. Requerimientos listado
try {
  const { status, data } = await api('GET', '/requerimientos?limite=5');
  if (status === 200 && Array.isArray(data?.datos)) {
    ok('Listar requerimientos', `${data.total} total`);
  } else fail('Listar requerimientos', `status=${status}`);
} catch (e) { fail('Listar requerimientos', e.message); }

// 6. Requerimientos en_revision (aging)
try {
  const { status, data } = await api('GET', '/requerimientos?estado=en_revision&limite=5');
  if (status === 200) {
    ok('Req en revisión', `${data?.total ?? '?'} pendientes`);
  } else fail('Req en revisión', `status=${status}`);
} catch (e) { fail('Req en revisión', e.message); }

// 7. Áreas
try {
  const { status, data } = await api('GET', '/areas');
  if (status === 200 && Array.isArray(data?.areas)) {
    ok('Áreas', `${data.areas.length} áreas`);
  } else fail('Áreas', `status=${status}`);
} catch (e) { fail('Áreas', e.message); }

// 8. Catálogo (respuesta: array directo)
try {
  const { status, data } = await api('GET', '/catalogo?soloActivos=true');
  if (status === 200 && Array.isArray(data)) {
    ok('Catálogo', `${data.length} ítems activos`);
  } else fail('Catálogo', `status=${status}`);
} catch (e) { fail('Catálogo', e.message); }

// 9. Proveedores (respuesta: array directo)
try {
  const { status, data } = await api('GET', '/proveedores?activos=true');
  if (status === 200 && Array.isArray(data)) {
    ok('Proveedores', `${data.length} activos`);
  } else fail('Proveedores', `status=${status}`);
} catch (e) { fail('Proveedores', e.message); }

// 10. Detalle OC activa (si hay)
try {
  const { data: list } = await api('GET', '/ordenes-compra?estado=activas&limite=1');
  if (list?.datos?.[0]) {
    const id = list.datos[0].id;
    const { status, data } = await api('GET', `/ordenes-compra/${id}`);
    if (status === 200 && data?.numero_oc) {
      ok('Detalle OC', data.numero_oc);
      if (!data.consecutivo) warn('Detalle OC', 'sin consecutivo de req');
    } else fail('Detalle OC', `status=${status}`);
  } else {
    warn('Detalle OC', 'sin OC activas para probar');
  }
} catch (e) { fail('Detalle OC', e.message); }

// 11. Detalle req en_revision (si hay)
try {
  const { data: list } = await api('GET', '/requerimientos?estado=en_revision&limite=1');
  if (list?.datos?.[0]) {
    const id = list.datos[0].id;
    const { status, data } = await api('GET', `/requerimientos/${id}`);
    if (status === 200 && data?.consecutivo) {
      ok('Detalle requerimiento', data.consecutivo);
      if (data.items?.length && data.items_libres?.length) {
        fail('Regla exclusividad', `${data.consecutivo} tiene catálogo Y libres`);
      }
    } else fail('Detalle requerimiento', `status=${status}`);
  } else {
    warn('Detalle requerimiento', 'sin reqs en revisión');
  }
} catch (e) { fail('Detalle requerimiento', e.message); }

// 12. Login solicitante (permisos)
try {
  const [[sol]] = await pool.query(
    "SELECT email FROM usuarios WHERE rol='solicitante' AND activo=1 AND email_verificado=1 LIMIT 1"
  );
  if (sol) {
    // No tenemos password — solo verificamos que login rechaza credencial inválida
    const { status } = await api('POST', '/auth/login', { email: sol.email, password: 'wrong' }, false);
    if (status === 401) ok('Login rechaza password incorrecta');
    else warn('Login solicitante', `status inesperado ${status}`);
  } else {
    warn('Login solicitante', 'no hay solicitante activo en BD');
  }
} catch (e) { fail('Login solicitante', e.message); }

// 13. Reportes (admin)
try {
  const { status } = await api('GET', '/reportes/status-pos-hilos?anio=2026');
  if (status === 200) ok('Reporte status PO');
  else fail('Reporte status PO', `status=${status}`);
} catch (e) { fail('Reporte status PO', e.message); }

// 14. Integridad BD — reqs con catálogo Y libres (violación de regla)
try {
  const [mix] = await pool.query(`
    SELECT r.id, r.consecutivo FROM requerimientos r
    WHERE EXISTS (SELECT 1 FROM requerimiento_items ri WHERE ri.requerimiento_id = r.id)
      AND EXISTS (SELECT 1 FROM requerimiento_items_libres ril WHERE ril.requerimiento_id = r.id)
    LIMIT 5
  `);
  if (mix.length === 0) ok('Integridad exclusividad items');
  else fail('Integridad exclusividad items', `${mix.length} reqs mezclados: ${mix.map(r => r.consecutivo).join(', ')}`);
} catch (e) { fail('Integridad exclusividad', e.message); }

// 15. Aprobados sin OC vinculada
try {
  const [[{ c }]] = await pool.query(
    `SELECT COUNT(*) AS c FROM requerimientos WHERE estado = 'aprobado' AND orden_compra_id IS NULL`
  );
  if (c === 0) ok('Aprobados con OC vinculada');
  else warn('Aprobados sin OC', `${c} requerimientos aprobados sin orden_compra_id`);
} catch (e) { fail('Aprobados sin OC', e.message); }

// 16. KPI dashboard vs OC activas (recibida)
try {
  const { data: dash } = await api('GET', '/dashboard/stats?anio=2026');
  const ocMap = {};
  dash.estados_oc.forEach(o => { ocMap[o.estado] = +o.total; });
  const kpiEnVuelo = (ocMap.generada || 0) + (ocMap.distribuida || 0) + (ocMap.en_proceso || 0);
  const { data: activas } = await api('GET', '/ordenes-compra?estado=activas&limite=1');
  const totalActivas = activas?.total ?? 0;
  const recibidas = ocMap.recibida || 0;
  if (recibidas > 0 && kpiEnVuelo !== totalActivas) {
    warn('KPI OC en proceso', `KPI muestra ${kpiEnVuelo} pero activas=${totalActivas} (falta incluir recibida=${recibidas})`);
  } else {
    ok('KPI vs OC activas', `activas=${totalActivas}`);
  }
} catch (e) { fail('KPI vs OC activas', e.message); }

// 17. Variable JWT en .env
const jwtVal = process.env.JWT_EXPIRES_IN || process.env.JWT_EXPIRES;
if (jwtVal) ok('JWT expires configurado', jwtVal);
else warn('JWT expires', 'sin JWT_EXPIRES_IN ni JWT_EXPIRES — usa default 8h');

// 18. Sin autenticación → 401
try {
  const prev = token;
  token = null;
  const { status } = await api('GET', '/requerimientos');
  token = prev;
  if (status === 401) ok('Protección auth sin token');
  else fail('Protección auth', `status=${status} esperado 401`);
} catch (e) { fail('Protección auth', e.message); }

// Resumen
console.log('\n=== Resumen ===');
const fails = resultados.filter(r => r.estado === 'FAIL');
const warns = resultados.filter(r => r.estado === 'WARN');
console.log(`OK: ${resultados.filter(r => r.estado === 'OK').length}`);
console.log(`WARN: ${warns.length}`);
console.log(`FAIL: ${fails.length}`);
if (fails.length) {
  console.log('\nFallos:');
  fails.forEach(f => console.log(`  - ${f.nombre}: ${f.detalle}`));
}
if (warns.length) {
  console.log('\nAdvertencias:');
  warns.forEach(w => console.log(`  - ${w.nombre}: ${w.detalle}`));
}

await pool.end();
process.exit(fails.length ? 1 : 0);