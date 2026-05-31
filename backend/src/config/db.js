import { createPool } from 'mysql2/promise';

// Ensure environment variables are loaded
import './env.js';

const pool = createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME     || 'ordenes_compra',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone: '+00:00',
});

// Verificar conexión al iniciar
pool.getConnection()
  .then(conn => {
    console.log('✔  Conectado a MySQL:', process.env.DB_NAME);
    conn.release();
  })
  .catch(err => {
    console.error('✘  Error al conectar a MySQL:', err.message);
    process.exit(1);
  });

export default pool;