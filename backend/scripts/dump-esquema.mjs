/**
 * Vuelca la estructura de la BD (tablas, columnas, índices, FKs) sin datos.
 *
 *   node scripts/dump-esquema.mjs
 *   node scripts/dump-esquema.mjs --json
 *
 * Usa .env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).
 */
import { createHash } from 'crypto';
import '../src/config/env.js';
import pool from '../src/config/db.js';

const AS_JSON = process.argv.includes('--json');

function fingerprint(porTabla) {
  const lines = [];
  for (const nombre of Object.keys(porTabla).sort()) {
    const t = porTabla[nombre];
    for (const c of t.columns) {
      lines.push(`${nombre}.${c.name}|${c.type}|${c.nullable ? 'NULL' : 'NOT NULL'}`);
    }
  }
  return createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);
}

function filaCol(c) {
  const def = c.COLUMN_DEFAULT == null ? '' : String(c.COLUMN_DEFAULT);
  return [
    c.COLUMN_NAME,
    c.COLUMN_TYPE,
    c.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL',
    def ? `DEFAULT ${def}` : '',
    c.EXTRA || '',
  ]
    .filter(Boolean)
    .join(' | ');
}

try {
  const db = process.env.DB_NAME || 'ordenes_compra';
  const [[meta]] = await pool.query('SELECT DATABASE() AS db, VERSION() AS version');

  const [tablas] = await pool.query(
    `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [db]
  );

  const [cols] = await pool.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, ORDINAL_POSITION
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [db]
  );

  const [idx] = await pool.query(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnas
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ?
     GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
     ORDER BY TABLE_NAME, INDEX_NAME`,
    [db]
  );

  const [fks] = await pool.query(
    `SELECT
       k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME,
       k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
       r.UPDATE_RULE, r.DELETE_RULE
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
      AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
     WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
    [db]
  );

  const porTabla = {};
  for (const t of tablas) {
    porTabla[t.TABLE_NAME] = {
      engine: t.ENGINE,
      collation: t.TABLE_COLLATION,
      columns: [],
      indexes: [],
      fks: [],
    };
  }
  for (const c of cols) {
    if (!porTabla[c.TABLE_NAME]) continue;
    porTabla[c.TABLE_NAME].columns.push({
      name: c.COLUMN_NAME,
      type: c.COLUMN_TYPE,
      nullable: c.IS_NULLABLE === 'YES',
      default: c.COLUMN_DEFAULT,
      extra: c.EXTRA || '',
    });
  }
  for (const i of idx) {
    if (!porTabla[i.TABLE_NAME]) continue;
    porTabla[i.TABLE_NAME].indexes.push({
      name: i.INDEX_NAME,
      unique: Number(i.NON_UNIQUE) === 0,
      columns: i.columnas,
    });
  }
  for (const f of fks) {
    if (!porTabla[f.TABLE_NAME]) continue;
    porTabla[f.TABLE_NAME].fks.push({
      name: f.CONSTRAINT_NAME,
      column: f.COLUMN_NAME,
      ref: `${f.REFERENCED_TABLE_NAME}.${f.REFERENCED_COLUMN_NAME}`,
      onUpdate: f.UPDATE_RULE,
      onDelete: f.DELETE_RULE,
    });
  }

  const fp = fingerprint(porTabla);

  if (AS_JSON) {
    console.log(JSON.stringify({ database: meta.db, version: meta.version, fingerprint: fp, tables: porTabla }, null, 2));
  } else {
    console.log(`BD: ${meta.db}  MySQL ${meta.version}`);
    console.log(`Tablas: ${tablas.length}`);
    console.log(`Huella columnas: ${fp}`);
    console.log('');
    for (const nombre of Object.keys(porTabla)) {
      const t = porTabla[nombre];
      console.log(`=== ${nombre} (${t.engine} ${t.collation}) ===`);
      for (const c of t.columns) {
        console.log(
          '  '
            + filaCol({
              COLUMN_NAME: c.name,
              COLUMN_TYPE: c.type,
              IS_NULLABLE: c.nullable ? 'YES' : 'NO',
              COLUMN_DEFAULT: c.default,
              EXTRA: c.extra,
            })
        );
      }
      for (const i of t.indexes) {
        console.log(`  IDX ${i.unique ? 'UNIQUE' : 'KEY'} ${i.name} (${i.columns})`);
      }
      for (const f of t.fks) {
        console.log(`  FK ${f.name}: ${f.column} → ${f.ref} ON UPDATE ${f.onUpdate} ON DELETE ${f.onDelete}`);
      }
      console.log('');
    }
  }
} finally {
  await pool.end();
}
