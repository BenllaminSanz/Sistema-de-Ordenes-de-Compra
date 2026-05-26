import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { hash } from 'bcryptjs';
import pool from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const email    = process.env.ADMIN_EMAIL    || 'admin@empresa.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin1234!';
  const nombre   = process.env.ADMIN_NOMBRE   || 'Administrador';

  console.log(`Creando usuario admin: ${email}`);

  const passwordHash = await hash(password, 12);

  await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     VALUES (?, ?, ?, 'admin')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [nombre, email, passwordHash]
  );

  console.log('✔  Usuario admin listo.');
  console.log(`   Email:      ${email}`);
  console.log(`   Contraseña: ${password}`);
  console.log('\n   Cambia la contraseña después del primer login.');

  process.exit(0);
}

main().catch(err => {
  console.error('Error en seed:', err);
  process.exit(1);
});