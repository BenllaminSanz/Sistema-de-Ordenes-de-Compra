/**
 * Runner multiplataforma para node:test.
 *
 * Uso:
 *   node tests/run.mjs unit
 *   node tests/run.mjs integration
 *   node tests/run.mjs unit --coverage
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');

const suite = process.argv[2] || 'unit';
const wantCoverage = process.argv.includes('--coverage');

function findTests(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) findTests(p, acc);
    else if (name.endsWith('.test.js')) acc.push(p);
  }
  return acc;
}

const suiteDir = join(__dirname, suite);
const absFiles = findTests(suiteDir).sort();
const files = absFiles.map((f) => relative(backendRoot, f).split('\\').join('/'));

if (files.length === 0) {
  if (suite === 'integration') {
    console.log(`No hay tests en tests/${suite} todavía.`);
    process.exit(0);
  }
  console.error(`No se encontraron *.test.js en tests/${suite}`);
  process.exit(1);
}

const setupImport = pathToFileURL(join(__dirname, 'setup-env.js')).href;

const nodeArgs = [
  '--import',
  setupImport,
  '--test',
  '--test-reporter=spec',
  // Integración: serial + forzar salida (pool MySQL / mailer dejan handles abiertos)
  ...(suite === 'integration'
    ? ['--test-concurrency=1', '--test-force-exit']
    : []),
  ...files,
];

let result;
if (wantCoverage) {
  result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['c8', '--reporter=text', '--reporter=lcov', 'node', ...nodeArgs],
    {
      cwd: backendRoot,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    }
  );
} else {
  result = spawnSync(process.execPath, nodeArgs, {
    cwd: backendRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

process.exit(result.status ?? 1);
