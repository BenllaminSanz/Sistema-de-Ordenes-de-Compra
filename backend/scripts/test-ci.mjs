/**
 * Pruebas aptas para CI (sin MySQL ni servidor en marcha).
 * Uso: node scripts/test-ci.mjs
 *
 * Valida: versión SemVer alineada, archivos clave y sintaxis del backend.
 * Las pruebas de flujo completo siguen en: npm test (requieren entorno local).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');

const resultados = [];
let fallos = 0;

function ok(nombre, detalle = '') {
  resultados.push({ estado: 'OK', nombre, detalle });
  console.log(`  ✅ ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

function fail(nombre, detalle = '') {
  fallos += 1;
  resultados.push({ estado: 'FAIL', nombre, detalle });
  console.log(`  ❌ ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

console.log('\n=== CI: comprobaciones sin BD ===\n');

// 1. package.json versión SemVer y alineada con package-lock
const pkgPath = path.join(backendRoot, 'package.json');
const lockPath = path.join(backendRoot, 'package-lock.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

const semver = /^\d+\.\d+\.\d+$/;
if (semver.test(pkg.version)) ok('package.json version SemVer', pkg.version);
else fail('package.json version SemVer', `obtenido: ${pkg.version}`);

if (lock.version === pkg.version) ok('package-lock version alineada', lock.version);
else fail('package-lock version alineada', `lock=${lock.version} vs package=${pkg.version}`);

const lockRoot = lock.packages?.['']?.version;
if (lockRoot === pkg.version) ok('package-lock packages[""].version', lockRoot);
else fail('package-lock packages[""].version', `obtenido: ${lockRoot}`);

// 2. Archivos críticos del proyecto
const criticos = [
  'backend/app.js',
  'backend/package.json',
  'frontend/js/app.js',
  'frontend/login.html',
  'frontend/css/app.css',
  'CHANGELOG.md',
  'VERSIONING.md',
  'README.md',
  '.env.example',
];
for (const rel of criticos) {
  const full = path.join(projectRoot, rel);
  if (fs.existsSync(full)) ok(`Existe ${rel}`);
  else fail(`Existe ${rel}`, 'no encontrado');
}

// 3. Health expone version (código fuente)
const appJs = fs.readFileSync(path.join(backendRoot, 'app.js'), 'utf8');
if (appJs.includes('APP_VERSION') && appJs.includes('version: APP_VERSION')) {
  ok('Health incluye version en código');
} else {
  fail('Health incluye version en código', 'no se encontró APP_VERSION en /api/health');
}

// 4. Frontend carga versión
const feApp = fs.readFileSync(path.join(projectRoot, 'frontend/js/app.js'), 'utf8');
if (feApp.includes('cargarVersionApp') && feApp.includes('app-version')) {
  ok('Frontend muestra versión (sidebar)');
} else {
  fail('Frontend muestra versión (sidebar)', 'falta cargarVersionApp o #app-version');
}

// 5. Sintaxis de módulos backend (node --check)
function listJsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === 'node_modules' || name.name === 'uploads') continue;
      listJsFiles(full, acc);
    } else if (name.name.endsWith('.js') || name.name.endsWith('.mjs')) {
      acc.push(full);
    }
  }
  return acc;
}

const jsFiles = [
  path.join(backendRoot, 'app.js'),
  ...listJsFiles(path.join(backendRoot, 'src')),
  ...listJsFiles(path.join(backendRoot, 'scripts')),
];

let syntaxFails = 0;
for (const file of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    syntaxFails += 1;
    fail(`Sintaxis ${path.relative(projectRoot, file)}`, (r.stderr || r.stdout || '').trim().slice(0, 200));
  }
}
if (syntaxFails === 0) ok('Sintaxis JS backend', `${jsFiles.length} archivos`);

// Resumen
console.log('\n── Resumen CI ──');
const oks = resultados.filter((r) => r.estado === 'OK').length;
console.log(`  OK: ${oks}  |  FAIL: ${fallos}\n`);
process.exit(fallos > 0 ? 1 : 0);
