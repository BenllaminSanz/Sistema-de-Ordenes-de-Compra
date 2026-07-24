import pool from '../config/db.js';

function normalizarNumProveedor(valor) {
  if (valor == null || valor === '') return null;
  const limpio = String(valor).replace(/\D/g, '');
  if (!limpio) return null;
  return limpio.padStart(5, '0').slice(-5);
}

async function listar(soloActivos = false) {
  const where = soloActivos ? 'WHERE activo = 1' : '';
  const [rows] = await pool.query(
    `SELECT id, num_proveedor, nombre, email, telefono, rfc, notas, activo, created_at
     FROM proveedores ${where} ORDER BY num_proveedor ASC, nombre ASC`
  );
  return rows;
}

async function obtenerPorId(id) {
  const [[prov]] = await pool.query(
    'SELECT * FROM proveedores WHERE id = ?', [id]
  );
  return prov || null;
}

async function crear(datos) {
  const email = datos.email != null && String(datos.email).trim()
    ? String(datos.email).trim().toLowerCase()
    : null;
  const [result] = await pool.query(
    `INSERT INTO proveedores (num_proveedor, nombre, email, telefono, rfc, notas)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      normalizarNumProveedor(datos.num_proveedor),
      datos.nombre,
      email,
      datos.telefono || null,
      datos.rfc || null,
      datos.notas || null
    ]
  );
  return result.insertId;
}

async function actualizar(id, datos) {
  const campos = {};
  ['num_proveedor', 'nombre', 'email', 'telefono', 'rfc', 'notas'].forEach(c => {
    if (datos[c] !== undefined) {
      if (c === 'num_proveedor') {
        campos[c] = normalizarNumProveedor(datos[c]);
      } else if (c === 'email') {
        const e = datos[c] != null && String(datos[c]).trim()
          ? String(datos[c]).trim().toLowerCase()
          : null;
        campos[c] = e;
      } else {
        campos[c] = datos[c];
      }
    }
  });
  if (!Object.keys(campos).length) return 0;
  const sets = Object.keys(campos).map(c => `${c} = ?`).join(', ');
  const [r] = await pool.query(
    `UPDATE proveedores SET ${sets} WHERE id = ?`,
    [...Object.values(campos), id]
  );
  return r.affectedRows;
}

async function cambiarEstado(id, activo) {
  const [r] = await pool.query(
    'UPDATE proveedores SET activo = ? WHERE id = ?', [activo ? 1 : 0, id]
  );
  return r.affectedRows;
}

async function obtenerPorNumProveedor(num) {
  const norm = normalizarNumProveedor(num);
  if (!norm) return null;
  const [[prov]] = await pool.query(
    'SELECT id, num_proveedor, nombre FROM proveedores WHERE num_proveedor = ? LIMIT 1',
    [norm]
  );
  return prov || null;
}

export { listar, obtenerPorId, crear, actualizar, cambiarEstado, normalizarNumProveedor, obtenerPorNumProveedor };