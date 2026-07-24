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

  logger.info('[migrate] Migraciones aplicadas');
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