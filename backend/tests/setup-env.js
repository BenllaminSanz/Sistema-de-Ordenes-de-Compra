/**
 * Precarga de entorno para el runner de tests.
 * Uso: node --import ./tests/setup-env.js --test ...
 */
import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');

process.env.NODE_ENV = 'test';
process.env.SKIP_DB_EAGER_CHECK = '1';

if (!process.env.SECRET_ENCRYPTION_KEY || Buffer.byteLength(process.env.SECRET_ENCRYPTION_KEY) !== 32) {
  process.env.SECRET_ENCRYPTION_KEY = '12345678901234567890123456789012';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test_jwt_secret_min_32_chars_xxxxxx';
}
if (!process.env.JWT_EXPIRES_IN) {
  process.env.JWT_EXPIRES_IN = '1h';
}

// Credenciales MySQL del proyecto (sin pisar lo ya definido en el shell/CI)
const rootEnv = path.join(projectRoot, '.env');
const backendEnv = path.join(backendRoot, '.env');
if (existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv, override: false });
} else if (existsSync(backendEnv)) {
  dotenv.config({ path: backendEnv, override: false });
}

const testEnv = path.join(__dirname, '.env.test');
if (existsSync(testEnv)) {
  dotenv.config({ path: testEnv, override: true });
}

// Seguridad: nunca tests contra BD sin sufijo _test
const dbName = String(process.env.DB_NAME || '').trim();
if (!dbName.endsWith('_test')) {
  process.env.DB_NAME = 'ordenes_compra_test';
}

// SMTP: mock en tests (mailer.js). Sin red real.
process.env.EMAIL_MOCK = '1';
process.env.EMAIL_HOST = '127.0.0.1';
process.env.EMAIL_PORT = '9';
process.env.EMAIL_USER = 'mock@test.local';
process.env.EMAIL_PASS = '';
process.env.EMAIL_CONNECTION_TIMEOUT_MS = '200';
process.env.EMAIL_GREETING_TIMEOUT_MS = '200';
process.env.EMAIL_SOCKET_TIMEOUT_MS = '200';
process.env.EMAIL_NOTIF_COMPRAS = '';
process.env.EMAIL_CC_COTIZACIONES = '';

process.env.SKIP_DB_EAGER_CHECK = '1';
process.env.NODE_ENV = 'test';
