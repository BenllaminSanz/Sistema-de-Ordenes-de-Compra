import pool from '../config/db.js';
import logger from './logger.js';

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return (rows[0]?.cnt || 0) > 0;
}

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  return (rows[0]?.cnt || 0) > 0;
}

async function getColumnType(table, column) {
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return rows[0]?.COLUMN_TYPE || null;
}

async function addColumnIfMissing(table, column, definition) {
  if (await columnExists(table, column)) return;
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  logger.info(`[migrate] Columna ${table}.${column} agregada`);
}

async function ensureRecepcionItemsTable() {
  if (await tableExists('recepcion_items')) return;

  const recepcionIdType = await getColumnType('recepciones', 'id');
  if (!recepcionIdType) {
    throw new Error('No se encontró la tabla recepciones — no se puede crear recepcion_items');
  }

  // Debe coincidir exactamente con recepciones.id (p. ej. int unsigned)
  const fkType = recepcionIdType.includes('unsigned') ? 'INT UNSIGNED' : 'INT';

  await pool.query(`
    CREATE TABLE recepcion_items (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      recepcion_id ${fkType} NOT NULL,
      item_key VARCHAR(64) NOT NULL,
      descripcion VARCHAR(500) NULL,
      codigo VARCHAR(100) NULL,
      cantidad_solicitada DECIMAL(14,3) NOT NULL DEFAULT 0,
      cantidad_recibida DECIMAL(14,3) NOT NULL DEFAULT 0,
      unidad VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_recepcion_items_rec (recepcion_id),
      CONSTRAINT fk_recepcion_items_rec FOREIGN KEY (recepcion_id)
        REFERENCES recepciones(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  logger.info('[migrate] Tabla recepcion_items creada');
}

export async function runDbMigrations() {
  await ensureRecepcionItemsTable();

  const catalogoIdType = await getColumnType('catalogo', 'id');
  const catFk = catalogoIdType?.includes('unsigned') ? 'INT UNSIGNED' : 'INT';

  await addColumnIfMissing('cotizacion_items', 'codigo_catalogo', 'VARCHAR(100) NULL AFTER descripcion');
  await addColumnIfMissing('cotizacion_items', 'catalogo_id', `${catFk} NULL AFTER codigo_catalogo`);
  await addColumnIfMissing('requerimiento_items_libres', 'catalogo_asignado_id', `${catFk} NULL`);

  // Fecha manual del PO en DataTextNow (distinta de created_at / fecha_autorizacion del sistema)
  await addColumnIfMissing(
    'ordenes_compra',
    'fecha_po',
    "DATE NULL COMMENT 'Fecha del PO en DataTextNow (captura manual al crear/editar OC)' AFTER datatextnow_id"
  );

  await ensureUnidadesMedidaTable();

  // Idioma del correo RFQ (es|en) para envío automático y manual
  await addColumnIfMissing(
    'cotizaciones',
    'idioma_correo',
    "VARCHAR(5) NOT NULL DEFAULT 'es' COMMENT 'Idioma del correo RFQ: es o en' AFTER email_sent_at"
  );

  // Email de proveedor opcional (tiendas / compra directa sin RFQ por correo)
  await ensureProveedorEmailNullable();

  // Número de recibo por línea de recepción
  await addColumnIfMissing(
    'recepcion_items',
    'numero_recibo',
    "VARCHAR(80) NULL COMMENT 'No. de recibo de la entrega para este ítem' AFTER unidad"
  );

  // Rol operativo: contabilidad → compras (todo el sistema)
  await migrarRolContabilidadACompras();

  // Estado intermedio: acuse formal de Compras (en_revision → recibido → aprobado/…)
  await asegurarEstadoRecibidoRequerimientos();

  await ensureConfiguracionAppTable();

  logger.info('[migrate] Migraciones aplicadas');
}

/**
 * Ajustes de correo independientes del SMTP: URL pública y notificaciones internas.
 */
async function ensureConfiguracionAppTable() {
  if (!(await tableExists('configuracion_app'))) {
    await pool.query(`
      CREATE TABLE configuracion_app (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        frontend_url VARCHAR(255) NULL,
        notif_req_revision TINYINT(1) NOT NULL DEFAULT 1,
        email_notif_compras VARCHAR(500) NULL,
        notif_roles VARCHAR(80) NOT NULL DEFAULT 'compras,admin',
        updated_by INT UNSIGNED NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(
      `INSERT INTO configuracion_app (id, notif_req_revision, notif_roles)
       VALUES (1, 1, 'compras,admin')`
    );
    logger.info('[migrate] Tabla configuracion_app creada');
    return;
  }
  await addColumnIfMissing(
    'configuracion_app',
    'notif_roles',
    "VARCHAR(80) NOT NULL DEFAULT 'compras,admin' COMMENT 'Roles que reciben aviso de REQ en revisión'"
  );
}

/**
 * Amplía requerimientos.estado para incluir `recibido` (acuse formal de Compras).
 * Flujo: en_revision → recibido → aprobado | incompleto | rechazado.
 */
async function asegurarEstadoRecibidoRequerimientos() {
  if (!(await tableExists('requerimientos'))) return;
  if (!(await columnExists('requerimientos', 'estado'))) return;

  const colType = await getColumnType('requerimientos', 'estado');
  if (!colType) return;

  const lower = String(colType).toLowerCase();
  if (lower.includes("'recibido'")) return;

  if (lower.startsWith('enum(')) {
    // Insertar 'recibido' después de 'en_revision' si existe; si no, al final del ENUM
    let newEnum = colType;
    if (/en_revision/i.test(colType)) {
      newEnum = colType.replace(/('en_revision')/i, "$1,'recibido'");
    } else {
      newEnum = colType.replace(/\)$/, ",'recibido')");
    }
    try {
      await pool.query(
        `ALTER TABLE requerimientos MODIFY COLUMN estado ${newEnum} NOT NULL DEFAULT 'borrador'`
      );
      logger.info('[migrate] requerimientos.estado ENUM actualizado con recibido');
    } catch (err) {
      logger.warn('[migrate] No se pudo agregar recibido al ENUM estado:', err.message);
    }
    return;
  }

  // Si es VARCHAR u otro tipo libre, no hace falta ALTER
  logger.info('[migrate] requerimientos.estado no es ENUM; recibido se acepta por validación de app');
}

/**
 * Renombra el rol de usuario `contabilidad` a `compras`.
 * Actualiza filas y, si `usuarios.rol` es ENUM, amplía/redefine el tipo.
 */
async function migrarRolContabilidadACompras() {
  if (!(await tableExists('usuarios'))) return;
  if (!(await columnExists('usuarios', 'rol'))) return;

  const colType = await getColumnType('usuarios', 'rol');
  if (colType && String(colType).toLowerCase().startsWith('enum(')) {
    // Asegurar que 'compras' exista en el ENUM (y mantener contabilidad temporalmente)
    const lower = String(colType).toLowerCase();
    if (!lower.includes("'compras'")) {
      let newEnum = colType;
      if (lower.includes("'contabilidad'")) {
        newEnum = colType.replace(/'contabilidad'/gi, "'contabilidad','compras'");
      } else {
        // enum('a','b') → insertar compras antes del cierre
        newEnum = colType.replace(/\)$/, ",'compras')");
      }
      try {
        await pool.query(`ALTER TABLE usuarios MODIFY COLUMN rol ${newEnum} NOT NULL`);
        logger.info('[migrate] usuarios.rol ENUM actualizado para incluir compras');
      } catch (err) {
        logger.warn('[migrate] No se pudo alterar ENUM usuarios.rol:', err.message);
      }
    }
  }

  const [result] = await pool.query(
    `UPDATE usuarios SET rol = 'compras' WHERE rol = 'contabilidad'`
  );
  if (result.affectedRows > 0) {
    logger.info(`[migrate] ${result.affectedRows} usuario(s) rol contabilidad → compras`);
  }

  // Opcional: dejar ENUM solo con valores finales
  if (colType && String(colType).toLowerCase().startsWith('enum(')) {
    try {
      await pool.query(
        `ALTER TABLE usuarios MODIFY COLUMN rol ENUM('solicitante','compras','admin') NOT NULL`
      );
      logger.info('[migrate] usuarios.rol ENUM final: solicitante, compras, admin');
    } catch (err) {
      // Si aún hay filas con valor viejo u otro ENUM, no bloquear arranque
      logger.warn('[migrate] ENUM final usuarios.rol no aplicado:', err.message);
    }
  }
}

/**
 * Permite proveedores sin correo (p. ej. Walmart, tiendas de compra directa).
 * Si la columna era NOT NULL, la relaja a NULL.
 */
async function ensureProveedorEmailNullable() {
  if (!(await tableExists('proveedores'))) return;
  if (!(await columnExists('proveedores', 'email'))) return;

  const [rows] = await pool.query(
    `SELECT IS_NULLABLE, COLUMN_TYPE, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'proveedores'
       AND COLUMN_NAME = 'email'
     LIMIT 1`
  );
  const col = rows[0];
  if (!col || col.IS_NULLABLE === 'YES') return;

  const type = col.COLUMN_TYPE || 'VARCHAR(255)';
  const comment = col.COLUMN_COMMENT
    ? ` COMMENT ${pool.escape(col.COLUMN_COMMENT)}`
    : " COMMENT 'Opcional: solo se usa para envío de RFQ por correo'";

  await pool.query(
    `ALTER TABLE proveedores MODIFY COLUMN email ${type} NULL${comment}`
  );
  logger.info('[migrate] proveedores.email ahora admite NULL');
}

async function ensureUnidadesMedidaTable() {
  if (!(await tableExists('unidades_medida'))) {
    await pool.query(`
      CREATE TABLE unidades_medida (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(30) NOT NULL,
        nombre VARCHAR(80) NOT NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_unidad_codigo (codigo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    logger.info('[migrate] Tabla unidades_medida creada');
  }

  // Semilla base + valores ya usados en catálogo
  const seeds = [
    ['pza', 'Pieza'],
    ['pieza', 'Pieza'],
    ['EA', 'Each / Unidad'],
    ['kg', 'Kilogramo'],
    ['g', 'Gramo'],
    ['lt', 'Litro'],
    ['m', 'Metro'],
    ['m2', 'Metro cuadrado'],
    ['hr', 'Hora'],
    ['servicio', 'Servicio'],
    ['lote', 'Lote'],
    ['caja', 'Caja'],
    ['par', 'Par'],
    ['juego', 'Juego'],
    ['gal', 'Galón'],
  ];

  for (const [codigo, nombre] of seeds) {
    await pool.query(
      `INSERT IGNORE INTO unidades_medida (codigo, nombre, activo) VALUES (?, ?, 1)`,
      [codigo, nombre]
    );
  }

  // Incorporar unidades distintas ya presentes en el catálogo
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT TRIM(unidad) AS u
      FROM catalogo
      WHERE unidad IS NOT NULL AND TRIM(unidad) <> ''
    `);
    for (const row of rows) {
      const u = String(row.u || '').trim();
      if (!u) continue;
      await pool.query(
        `INSERT IGNORE INTO unidades_medida (codigo, nombre, activo) VALUES (?, ?, 1)`,
        [u, u]
      );
    }
  } catch (_) {
    /* catálogo puede no existir aún */
  }
}