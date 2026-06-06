import pool from '../src/config/db.js';

const steps = [
  `ALTER TABLE proveedores MODIFY COLUMN num_proveedor CHAR(5) NULL`,
  `ALTER TABLE proveedores ADD UNIQUE INDEX uq_proveedores_num (num_proveedor)`,
];

for (const sql of steps) {
  try {
    await pool.query(sql);
    console.log('OK:', sql.slice(0, 60) + '...');
  } catch (err) {
    if (err.code === 'ER_DUP_KEYNAME') {
      console.log('Índice uq_proveedores_num ya existe');
    } else {
      console.error(err.message);
      process.exit(1);
    }
  }
}

console.log('Migración num_proveedor completada');
await pool.end();