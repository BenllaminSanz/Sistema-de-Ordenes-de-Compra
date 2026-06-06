import pool from '../src/config/db.js';

const sql = `
  ALTER TABLE catalogo
  ADD COLUMN moneda VARCHAR(3) NOT NULL DEFAULT 'MXN' AFTER costo_referencia
`;

try {
  await pool.query(sql);
  console.log('Columna moneda agregada a catalogo');
} catch (err) {
  if (err.code === 'ER_DUP_FIELDNAME') {
    console.log('Columna moneda ya existe en catalogo');
  } else {
    console.error(err.message);
    process.exit(1);
  }
} finally {
  await pool.end();
}