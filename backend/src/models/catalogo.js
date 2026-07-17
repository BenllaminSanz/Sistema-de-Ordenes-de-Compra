import pool from '../config/db.js';

/**
 * Listar elementos del catálogo con filtros
 */
async function listar(filtros = {}) {
  const { tipo, busqueda, proveedor_id, soloActivos = false } = filtros;

  let sql = `
    SELECT 
      c.id, 
      c.tipo, 
      c.codigo, 
      c.descripcion, 
      c.unidad,
      c.costo_referencia, 
      c.moneda,
      c.proveedor_id,
      p.num_proveedor as proveedor_num,
      p.nombre as proveedor_nombre,
      c.activo, 
      c.created_at, 
      c.updated_at
    FROM catalogo c
    LEFT JOIN proveedores p ON p.id = c.proveedor_id
    WHERE 1=1
  `;
  const params = [];

  if (soloActivos) {
    sql += ' AND c.activo = 1';
  }

  if (tipo) {
    sql += ' AND c.tipo = ?';
    params.push(tipo);
  }

  if (busqueda) {
    sql += ` AND (c.codigo LIKE ? OR c.descripcion LIKE ?)`;
    const like = `%${busqueda}%`;
    params.push(like, like);
  }

  if (proveedor_id) {
    sql += ' AND c.proveedor_id = ?';
    params.push(proveedor_id);
  }

  sql += ' ORDER BY c.codigo ASC';

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function obtenerPorId(id) {
  const [[item]] = await pool.query(
    `
    SELECT 
      c.*,
      p.num_proveedor as proveedor_num,
      p.nombre as proveedor_nombre
    FROM catalogo c
    LEFT JOIN proveedores p ON p.id = c.proveedor_id
    WHERE c.id = ?
    `,
    [id]
  );
  return item || null;
}

async function crear(datos, conn = null) {
  const db = conn || pool;
  const [result] = await db.query(
    `
    INSERT INTO catalogo (tipo, codigo, descripcion, unidad, costo_referencia, moneda, proveedor_id, activo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      datos.tipo,
      datos.codigo,
      datos.descripcion,
      datos.unidad || null,
      datos.costo_referencia != null ? datos.costo_referencia : null,
      datos.moneda || 'MXN',
      datos.proveedor_id || null,
      datos.activo !== undefined ? datos.activo : 1
    ]
  );
  return result.insertId;
}

/**
 * Genera un código único para el catálogo basado en tipo y descripción.
 * Usado al formalizar ítems libres desde una cotización seleccionada.
 */
async function generarCodigoUnico(conn, tipo, baseDescripcion = '') {
  const prefijos = { 
    PARTES: 'P', 
    SERVICIOS: 'S', 
    FLETES: 'F', 
    PRODUCTOS: 'P' 
  };
  const pref = prefijos[tipo] || 'X';

  let base = (baseDescripcion || 'NUEVO')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8) || 'ITEM';

  let codigo = `${pref}-${base}`;
  let i = 1;

  while (true) {
    const [ex] = await conn.query('SELECT 1 FROM catalogo WHERE codigo = ? LIMIT 1', [codigo]);
    if (ex.length === 0) return codigo;

    codigo = `${pref}-${base}-${i}`;
    i++;
    if (i > 50) {
      codigo = `${pref}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      // one last check
      const [ex2] = await conn.query('SELECT 1 FROM catalogo WHERE codigo = ? LIMIT 1', [codigo]);
      if (ex2.length === 0) return codigo;
      // very rare fallback
      codigo = `${pref}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      return codigo;
    }
  }
}

async function actualizar(id, datos) {
  const campos = {};
  ['tipo', 'codigo', 'descripcion', 'unidad', 'costo_referencia', 'moneda', 'proveedor_id'].forEach(c => {
    if (datos[c] !== undefined) campos[c] = datos[c];
  });

  if (!Object.keys(campos).length) return 0;

  const sets = Object.keys(campos).map(c => `${c} = ?`).join(', ');
  const [r] = await pool.query(
    `UPDATE catalogo SET ${sets} WHERE id = ?`,
    [...Object.values(campos), id]
  );
  return r.affectedRows;
}

async function cambiarEstado(id, activo) {
  const [r] = await pool.query(
    'UPDATE catalogo SET activo = ? WHERE id = ?',
    [activo ? 1 : 0, id]
  );
  return r.affectedRows;
}

async function obtenerPorCodigo(codigo) {
  if (!codigo) return null;
  const [[item]] = await pool.query(
    `SELECT c.*, p.num_proveedor AS proveedor_num, p.nombre AS proveedor_nombre
     FROM catalogo c
     LEFT JOIN proveedores p ON p.id = c.proveedor_id
     WHERE c.codigo = ?
     LIMIT 1`,
    [String(codigo).trim()]
  );
  return item || null;
}

/**
 * Borrado físico solo si el ítem está desactivado y no hay referencias.
 * No elimina registros de REQ/OC/cotizaciones relacionados.
 */
async function eliminarDesactivado(id) {
  const [[item]] = await pool.query(
    'SELECT id, activo, codigo FROM catalogo WHERE id = ?',
    [id]
  );
  if (!item) return { ok: false, status: 404, mensaje: 'Elemento no encontrado en el catálogo' };
  if (item.activo) {
    return {
      ok: false,
      status: 422,
      mensaje: 'Solo se pueden eliminar ítems desactivados. Desactívalo primero.',
    };
  }

  const checks = [
    ['requerimiento_items', 'catalogo_id'],
    ['cotizacion_items', 'catalogo_id'],
    ['requerimiento_items_libres', 'catalogo_asignado_id'],
  ];

  for (const [tabla, col] of checks) {
    try {
      const [[{ cnt }]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM \`${tabla}\` WHERE \`${col}\` = ?`,
        [id]
      );
      if (cnt > 0) {
        return {
          ok: false,
          status: 422,
          mensaje: `No se puede eliminar "${item.codigo}": está referenciado en ${cnt} registro(s) de ${tabla}. Los históricos se conservan; el ítem permanece desactivado.`,
        };
      }
    } catch (err) {
      // Tabla/columna puede no existir en instalaciones antiguas
      if (err.code !== 'ER_NO_SUCH_TABLE' && err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    }
  }

  const [r] = await pool.query('DELETE FROM catalogo WHERE id = ? AND activo = 0', [id]);
  if (!r.affectedRows) {
    return { ok: false, status: 404, mensaje: 'No se pudo eliminar el elemento' };
  }
  return { ok: true, mensaje: `Ítem "${item.codigo}" eliminado del catálogo` };
}

export {
  listar,
  obtenerPorId,
  obtenerPorCodigo,
  crear,
  actualizar,
  cambiarEstado,
  eliminarDesactivado,
  generarCodigoUnico,
};