/**
 * seed-admin.js
 * Crea o actualiza el usuario administrador definido en las variables de entorno.
 *
 * Uso:
 *   node backend/scripts/seed-admin.js
 *
 * Variables de entorno esperadas (en .env):
 *   ADMIN_EMAIL=jebesari48@gmail.com
 *   ADMIN_PASSWORD=TuPasswordSeguro123!
 *   ADMIN_NOMBRE=Benjamin Sanchez
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { hash } from 'bcryptjs';

import { 
  buscarPorEmail, 
  crear, 
  actualizar, 
  cambiarEstado 
} from '../src/models/usuario.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde la raíz del proyecto
const projectRoot = path.resolve(__dirname, '../../');
dotenv.config({ path: path.join(projectRoot, '.env') });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jebesari48@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin1234!';
const ADMIN_NOMBRE = process.env.ADMIN_NOMBRE || 'Benjamin Sanchez';

async function seedAdmin() {
  console.log('=== Seed de Usuario Administrador ===');
  console.log(`Email: ${ADMIN_EMAIL}`);
  console.log(`Nombre: ${ADMIN_NOMBRE}`);

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('❌ Error: ADMIN_EMAIL y ADMIN_PASSWORD son requeridos en .env');
    process.exit(1);
  }

  try {
    const emailLimpio = ADMIN_EMAIL.toLowerCase().trim();
    const password_hash = await hash(ADMIN_PASSWORD, 12);

    let usuario = await buscarPorEmail(emailLimpio);

    if (usuario) {
      // Actualizar usuario existente a admin
      console.log('Usuario encontrado. Actualizando a rol admin...');

      await actualizar(usuario.id, {
        nombre: ADMIN_NOMBRE,
        email: emailLimpio,
        rol: 'admin'
      });

      await actualizarPassword(usuario.id, password_hash);

      // Asegurar que esté activo y verificado
      await cambiarEstado(usuario.id, true);

      // Marcar email como verificado si la función existe
      try {
        const { marcarEmailVerificado } = await import('../src/models/usuario.js');
        if (marcarEmailVerificado) {
          await marcarEmailVerificado(usuario.id);
        }
      } catch (e) {
        // ignorar si no existe la función
      }

      console.log('✅ Usuario administrador actualizado exitosamente.');
      console.log(`   Email: ${emailLimpio}`);
      console.log(`   Password: ${ADMIN_PASSWORD}  (cámbialo después del primer login)`);
    } else {
      // Crear nuevo admin
      console.log('Usuario no encontrado. Creando nuevo administrador...');

      const id = await crear({
        nombre: ADMIN_NOMBRE,
        email: emailLimpio,
        password_hash,
        rol: 'admin'
      });

      // Activar y marcar verificado
      await cambiarEstado(id, true);

      try {
        const { marcarEmailVerificado } = await import('../src/models/usuario.js');
        if (marcarEmailVerificado) {
          await marcarEmailVerificado(id);
        }
      } catch (e) {}

      console.log('✅ Usuario administrador creado exitosamente.');
      console.log(`   ID: ${id}`);
      console.log(`   Email: ${emailLimpio}`);
      console.log(`   Password: ${ADMIN_PASSWORD}`);
    }

    console.log('\nRecuerda cambiar la contraseña después del primer inicio de sesión.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error al crear/actualizar admin:', err.message);
    console.error(err);
    process.exit(1);
  }
}

seedAdmin();