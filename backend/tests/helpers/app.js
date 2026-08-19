import { prepareTestDatabase } from './db.js';

let app = null;
let createAppFn = null;

/**
 * Carga createApp solo después de tener schema (evita queries del mailer
 * contra tablas inexistentes y pool apuntando a BD vacía).
 */
async function loadCreateApp() {
  if (createAppFn) return createAppFn;
  const mod = await import('../../src/app.js');
  createAppFn = mod.createApp;
  return createAppFn;
}

/**
 * App Express en memoria (sin listen). Prepara BD si hace falta.
 */
export async function ensureApp() {
  if (app) return app;
  await prepareTestDatabase();
  const createApp = await loadCreateApp();
  app = createApp();
  return app;
}

/** Tras ensureApp / before hook. */
export function getApp() {
  if (!app) {
    throw new Error('getApp() llamado antes de ensureApp()/prepareTestDatabase()');
  }
  return app;
}
