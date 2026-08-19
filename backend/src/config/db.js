import { createPool } from 'mysql2/promise';
import { projectRoot } from './env.js';

// Configuración de conexión a la Base de Datos
const pool = createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME     || 'ordenes_compra',
  //Configuración Adicional
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone: '+00:00',
});

const skipEagerCheck =
  process.env.SKIP_DB_EAGER_CHECK === '1'
  || process.env.NODE_ENV === 'test';

// Verificar conexión al iniciar (omitido en tests unitarios)
if (!skipEagerCheck) {
  pool.getConnection()
    .then(conn => {
      console.log('✔  Conectado a MySQL:', process.env.DB_NAME);
      conn.release();
    })
    .catch(err => {
      console.error('✘  Error al conectar a MySQL:', err.message);
      console.error('   Host:', process.env.DB_HOST || 'localhost');
      console.error('   BD:  ', process.env.DB_NAME || 'ordenes_compra');
      console.error('   .env esperado en:', projectRoot);
      console.error('   Revisa DB_HOST, DB_USER, DB_PASSWORD y DB_NAME en .env');
      process.exit(1);
    });
}

export default pool;
