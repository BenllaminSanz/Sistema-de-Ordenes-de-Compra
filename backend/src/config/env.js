// backend/src/config/env.js
import dotenv from 'dotenv';
import path from 'path';
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
const projectRoot = path.resolve(__dirname, '../../../');

dotenv.config({
  path: path.join(projectRoot, '.env'),
  override: false, // Do not override existing environment variables
});

// Optional: You can add validation for critical variables here in the future.
// Example:
// if (!process.env.JWT_SECRET) {
//   throw new Error('JWT_SECRET is required in .env file');
// }

export default process.env;
