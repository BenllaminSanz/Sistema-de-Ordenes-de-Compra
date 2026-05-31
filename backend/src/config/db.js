import { createPool } from 'mysql2/promise';
import './env.js';

// Configuración de conexión a la Base de Datos
const pool = createPool({
  host:     process.env.DB_HOST     || 'localhost', //Cambia por la IP del servidor
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',      //Crear usuario para base de datos  
  password: process.env.DB_PASSWORD || 'root',      //Definir una password
  database: process.env.DB_NAME     || 'ordenes_compra',  // Nombre de la base de datos
  //Configuración Adicional
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