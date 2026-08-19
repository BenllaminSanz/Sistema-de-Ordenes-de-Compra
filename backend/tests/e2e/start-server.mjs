/**
 * Servidor HTTP para E2E: BD de test + createApp() en un puerto dedicado.
 * Arrancar con: node --import ./tests/setup-env.js tests/e2e/start-server.mjs
 */
import { prepareTestDatabase } from '../helpers/db.js';

const PORT = Number(process.env.PORT || process.env.E2E_PORT || 3999);
const HOST = process.env.E2E_HOST || '127.0.0.1';

await prepareTestDatabase();

const { createApp } = await import('../../src/app.js');
const app = createApp();

const server = app.listen(PORT, HOST, () => {
  console.log(`E2E server http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
