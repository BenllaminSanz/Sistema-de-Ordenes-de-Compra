import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Centralized environment variables loader.
 *
 * This is the ONLY place in the project where dotenv.config() should be called.
 * It always loads the .env file from the project root, regardless of where
 * the script is executed from.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Go up from: backend/src/config → backend → project root
export const projectRoot = path.resolve(__dirname, '../../../');

const envRoot = path.join(projectRoot, '.env');
const envBackend = path.join(projectRoot, 'backend', '.env');

let envPath = envRoot;
if (!existsSync(envRoot) && existsSync(envBackend)) {
  console.warn('⚠️  .env está en backend/.env — debe estar en la raíz del proyecto:');
  console.warn('   ', envRoot);
  envPath = envBackend;
} else if (!existsSync(envRoot)) {
  console.warn('⚠️  No se encontró .env en la raíz del proyecto:');
  console.warn('   ', envRoot);
  console.warn('   Restaura el .env del servidor anterior (el ZIP de deploy no lo incluye).');
}

dotenv.config({
  path: envPath,
  override: false, // Do not override existing environment variables
});

export default process.env;
