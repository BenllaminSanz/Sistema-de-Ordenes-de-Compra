import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
});

const [cols] = await conn.query(`
  SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME IN ('recepciones', 'recepcion_items', 'cotizacion_items', 'ordenes_compra')
    AND COLUMN_NAME IN ('id', 'recepcion_id', 'orden_compra_id')
  ORDER BY TABLE_NAME, COLUMN_NAME
`);
console.log(JSON.stringify(cols, null, 2));

const [tables] = await conn.query("SHOW TABLES LIKE 'recepcion_items'");
console.log('recepcion_items exists:', tables.length > 0);

await conn.end();