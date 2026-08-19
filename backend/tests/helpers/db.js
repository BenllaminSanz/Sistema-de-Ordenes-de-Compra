import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { assertTestDatabase } from './dbGuard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', 'fixtures');

/** Tablas de flujo (se truncan entre tests; maestros base se re-seedan). */
const FLOW_TABLES = [
  'recepcion_items',
  'recepciones',
  'historial_estados',
  'ordenes_compra',
  'cotizacion_items',
  'cotizaciones',
  'requerimiento_items_libres',
  'requerimiento_items',
  'requerimientos',
  'configuracion_smtp',
];

/** Maestros que se recrean desde seed (no se truncan usuarios fijos en cada test, salvo re-seed). */
const MASTER_TABLES = [
  'catalogo',
  'proveedores',
  'unidades_medida',
  'consecutivos_control',
  'configuracion_smtp',
  'usuarios',
];

let adminConn = null;
let schemaReady = false;
let preparing = null;

function dbConfig(database) {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    multipleStatements: true,
    timezone: '+00:00',
    ...(database ? { database } : {}),
  };
}

export async function getAdminConnection() {
  if (adminConn) return adminConn;
  adminConn = await mysql.createConnection(dbConfig(assertTestDatabase()));
  return adminConn;
}

/**
 * Aplica schema + seed **una sola vez por proceso**.
 * No hace DROP después de que la app ya tiene un pool abierto.
 */
export async function prepareTestDatabase() {
  if (schemaReady) return assertTestDatabase();
  if (preparing) return preparing;

  preparing = (async () => {
    const dbName = assertTestDatabase();

    const bootstrap = await mysql.createConnection(dbConfig(null));
    try {
      await bootstrap.query(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } finally {
      await bootstrap.end();
    }

    const conn = await getAdminConnection();
    const schemaSql = fs.readFileSync(path.join(fixturesDir, 'schema.sql'), 'utf8');
    const seedSql = fs.readFileSync(path.join(fixturesDir, 'seed.sql'), 'utf8');
    await conn.query(schemaSql);
    await conn.query(seedSql);
    schemaReady = true;
    return dbName;
  })();

  try {
    return await preparing;
  } finally {
    preparing = null;
  }
}

/**
 * Limpia tablas de flujo entre tests.
 * También limpia usuarios creados en tests (id > 6) y catálogo extra (id > 5).
 */
export async function resetFlowTables() {
  const conn = await getAdminConnection();
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of FLOW_TABLES) {
    await conn.query(`TRUNCATE TABLE \`${table}\``);
  }
  // Usuarios creados en tests (seed fija id 1..6)
  await conn.query('DELETE FROM usuarios WHERE id > 6');
  // Catálogo formalizado / import en tests (seed fija id 1..5)
  await conn.query('DELETE FROM catalogo WHERE id > 5');
  // Reactivar seed de catálogo (por si un test desactivó ítems)
  await conn.query('UPDATE catalogo SET activo = 1 WHERE id <= 5');
  // Proveedores creados en tests (seed fija id 1..3)
  await conn.query('DELETE FROM proveedores WHERE id > 3');
  await conn.query('UPDATE proveedores SET activo = 1 WHERE id <= 3');
  await conn.query('UPDATE consecutivos_control SET ultimo_numero = 0');
  try {
    await conn.query(
      `INSERT INTO configuracion_app (id, frontend_url, notif_req_revision, email_notif_compras, notif_roles, reporte_diario, reporte_diario_ultimo)
       VALUES (1, NULL, 1, NULL, 'compras,admin', 1, NULL)
       ON DUPLICATE KEY UPDATE
         frontend_url = NULL,
         notif_req_revision = 1,
         email_notif_compras = NULL,
         notif_roles = 'compras,admin',
         reporte_diario = 1,
         reporte_diario_ultimo = NULL`
    );
  } catch (_) { /* tabla puede no existir en esquemas viejos */ }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  try {
    const { invalidarAjustesCorreoCache } = await import('../../src/models/configApp.js');
    invalidarAjustesCorreoCache();
  } catch (_) { /* ignore */ }
}

export async function query(sql, params = []) {
  const conn = await getAdminConnection();
  return conn.query(sql, params);
}

/** Solo para fin de proceso si se desea; no llamar entre archivos de test. */
export async function closeDb() {
  if (adminConn) {
    await adminConn.end();
    adminConn = null;
  }
}

export { FLOW_TABLES, MASTER_TABLES };
