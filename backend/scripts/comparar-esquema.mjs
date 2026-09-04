/**
 * Compara estructura local (.env) vs un MySQL remoto (solo lectura).
 *
 *   $env:REMOTE_MYSQL_PASSWORD='...'
 *   node scripts/comparar-esquema.mjs --host 10.102.128.65 --user oc_lectura --database ordenes_compra
 */
import '../src/config/env.js';
import mysql from 'mysql2/promise';
import pool from '../src/config/db.js';

function arg(name, def = null) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (p) return p.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
    return process.argv[i + 1];
  }
  return def;
}

async function volcar(conn, schema) {
  const [tablas] = await conn.query(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [schema]
  );
  const [cols] = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, ORDINAL_POSITION
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [schema]
  );
  const [idx] = await conn.query(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnas
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ?
     GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
     ORDER BY TABLE_NAME, INDEX_NAME`,
    [schema]
  );
  const [fks] = await conn.query(
    `SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME,
            k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
            r.UPDATE_RULE, r.DELETE_RULE
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
      AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
     WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
    [schema]
  );

  const out = {};
  for (const t of tablas) out[t.TABLE_NAME] = { columns: {}, indexes: {}, fks: {} };
  for (const c of cols) {
    if (!out[c.TABLE_NAME]) continue;
    out[c.TABLE_NAME].columns[c.COLUMN_NAME] = {
      type: String(c.COLUMN_TYPE || '').toLowerCase(),
      nullable: c.IS_NULLABLE === 'YES',
      default: c.COLUMN_DEFAULT == null ? null : String(c.COLUMN_DEFAULT),
      extra: String(c.EXTRA || '').toLowerCase(),
    };
  }
  for (const i of idx) {
    if (!out[i.TABLE_NAME]) continue;
    out[i.TABLE_NAME].indexes[i.INDEX_NAME] = {
      unique: Number(i.NON_UNIQUE) === 0,
      columns: String(i.columnas || ''),
    };
  }
  for (const f of fks) {
    if (!out[f.TABLE_NAME]) continue;
    out[f.TABLE_NAME].fks[`${f.CONSTRAINT_NAME}:${f.COLUMN_NAME}`] = {
      ref: `${f.REFERENCED_TABLE_NAME}.${f.REFERENCED_COLUMN_NAME}`,
      onUpdate: f.UPDATE_RULE,
      onDelete: f.DELETE_RULE,
    };
  }
  return out;
}

function normDefault(v) {
  if (v == null) return null;
  const s = String(v).replace(/^'|'$/g, '');
  if (s === 'NULL') return null;
  if (/current_timestamp/i.test(s)) return 'CURRENT_TIMESTAMP';
  return s;
}

function normType(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/\b(tinyint|smallint|mediumint|int|bigint)\(\d+\)/g, '$1');
}

function colSig(c) {
  return `${normType(c.type)}|${c.nullable ? 'NULL' : 'NOT NULL'}`;
}

const host = arg('host');
const user = arg('user');
const database = arg('database', 'ordenes_compra');
const password = process.env.REMOTE_MYSQL_PASSWORD || arg('password');

if (!host || !user || !password) {
  console.error('Falta --host, --user o REMOTE_MYSQL_PASSWORD');
  process.exit(1);
}

const remote = await mysql.createConnection({
  host,
  port: Number(arg('port', '3306')),
  user,
  password,
  database,
  ssl: { rejectUnauthorized: false },
  connectTimeout: 15000,
});

try {
  const [[locMeta]] = await pool.query('SELECT DATABASE() AS db, VERSION() AS version');
  const [[remMeta]] = await remote.query('SELECT DATABASE() AS db, VERSION() AS version');
  const local = await volcar(pool, locMeta.db);
  const remoto = await volcar(remote, database);

  const tablasLocal = Object.keys(local).sort();
  const tablasRemoto = Object.keys(remoto).sort();
  const soloLocal = tablasLocal.filter((t) => !remoto[t]);
  const soloRemoto = tablasRemoto.filter((t) => !local[t]);
  const comunes = tablasLocal.filter((t) => remoto[t]);

  const colFaltanServidor = [];
  const colFaltanLocal = [];
  const colTipo = [];
  const idxDiff = [];
  const fkDiff = [];

  for (const t of comunes) {
    const cl = local[t].columns;
    const cr = remoto[t].columns;
    for (const name of Object.keys(cl)) {
      if (!cr[name]) colFaltanServidor.push(`${t}.${name}  (${colSig(cl[name])})`);
      else if (colSig(cl[name]) !== colSig(cr[name])) {
        colTipo.push(
          `${t}.${name}: local ${colSig(cl[name])}  vs  servidor ${colSig(cr[name])}`
        );
      } else {
        const dl = normDefault(cl[name].default);
        const dr = normDefault(cr[name].default);
        if (dl !== dr && !((dl == null && dr == null))) {
          // default-only; report separately if it could affect inserts
          colTipo.push(
            `${t}.${name}: DEFAULT local=${dl ?? 'NULL'}  vs  servidor=${dr ?? 'NULL'} (tipo igual)`
          );
        }
      }
    }
    for (const name of Object.keys(cr)) {
      if (!cl[name]) colFaltanLocal.push(`${t}.${name}  (${colSig(cr[name])})`);
    }

    const il = local[t].indexes;
    const ir = remoto[t].indexes;
    for (const name of Object.keys(il)) {
      if (name === 'PRIMARY') continue;
      const a = il[name];
      const b = ir[name];
      if (!b) idxDiff.push(`${t} índice local '${name}' (${a.columns}) no está en servidor`);
      else if (a.columns !== b.columns || a.unique !== b.unique) {
        idxDiff.push(
          `${t}.${name}: local ${a.unique ? 'UNIQUE ' : ''}${a.columns} vs servidor ${b.unique ? 'UNIQUE ' : ''}${b.columns}`
        );
      }
    }
    for (const name of Object.keys(ir)) {
      if (name === 'PRIMARY') continue;
      if (!il[name]) idxDiff.push(`${t} índice servidor '${name}' (${ir[name].columns}) no está en local`);
    }

    const fl = local[t].fks;
    const fr = remoto[t].fks;
    for (const name of Object.keys(fl)) {
      if (!fr[name]) fkDiff.push(`${t} FK local ${name} → ${fl[name].ref} no está en servidor`);
    }
    for (const name of Object.keys(fr)) {
      if (!fl[name]) fkDiff.push(`${t} FK servidor ${name} → ${fr[name].ref} no está en local`);
    }
  }

  console.log('=== Comparación de estructura (sin datos, sin cambios) ===');
  console.log(`Local:    ${locMeta.db}  MySQL ${locMeta.version}`);
  console.log(`Servidor: ${remMeta.db}  MySQL ${remMeta.version}  @ ${host}`);
  console.log(`Tablas:   local ${tablasLocal.length}  |  servidor ${tablasRemoto.length}`);
  console.log('');

  console.log('-- Tablas solo en LOCAL --');
  console.log(soloLocal.length ? soloLocal.map((t) => `  ${t}`).join('\n') : '  (ninguna)');
  console.log('-- Tablas solo en SERVIDOR --');
  console.log(soloRemoto.length ? soloRemoto.map((t) => `  ${t}`).join('\n') : '  (ninguna)');
  console.log('');

  console.log('-- Columnas en LOCAL que NO están en el servidor (el código puede fallar allá) --');
  console.log(colFaltanServidor.length ? colFaltanServidor.map((x) => `  ${x}`).join('\n') : '  (ninguna)');
  console.log('-- Columnas en SERVIDOR que NO están en local --');
  console.log(colFaltanLocal.length ? colFaltanLocal.map((x) => `  ${x}`).join('\n') : '  (ninguna)');
  console.log('');

  console.log('-- Tipo / NULL / DEFAULT distintos --');
  console.log(colTipo.length ? colTipo.map((x) => `  ${x}`).join('\n') : '  (ninguno)');
  console.log('');

  console.log('-- Índices distintos (excepto PRIMARY) --');
  console.log(idxDiff.length ? idxDiff.map((x) => `  ${x}`).join('\n') : '  (ninguno)');
  console.log('');

  console.log('-- Foreign keys distintas --');
  console.log(fkDiff.length ? fkDiff.map((x) => `  ${x}`).join('\n') : '  (ninguna)');

  const criticas = soloLocal.length + soloRemoto.length + colFaltanServidor.length + colTipo.filter((x) => !x.includes('DEFAULT')).length;
  console.log('');
  console.log(`Resumen: ${colFaltanServidor.length} col(s) faltan en servidor, ${colFaltanLocal.length} extra en servidor, ${colTipo.length} desajuste(s) de tipo/default, ${idxDiff.length} índice(s), ${fkDiff.length} FK(s).`);
} finally {
  await remote.end();
  await pool.end();
}
