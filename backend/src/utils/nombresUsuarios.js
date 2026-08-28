/**
 * Detecta y fusiona cuentas duplicadas por nombre corto vs. nombre completo.
 *
 * Caso típico: el Excel de import dejó "Juan Manuel Camacho Herrera" (inactivo,
 * @import.local) y la persona se registró como "Juan Camacho".
 *
 * El nombre que se usa en el sistema es el corto de la cuenta de login.
 * El largo solo sirve para reconocer el duplicado.
 *
 * - Conserva el nombre de la cuenta canónica (no lo alarga).
 * - Reasigna FKs (REQ, OC, recepciones, historial, config) al canónico.
 * - Elimina placeholders @import.local / sin-correo.* (también huérfanos, si no tienen REQ).
 *
 * Puro en detectarParesNombres; aplicarCorreccionNombres recibe el pool/conn.
 */

export const EMAIL_IMPORT_RE = /@import\.local$/i;
const NOMBRE_MAX = 120;

export function esEmailPlaceholder(email) {
  const e = String(email || '').toLowerCase().trim();
  return EMAIL_IMPORT_RE.test(e) || e.startsWith('sin-correo.');
}

export function esEmailImport(email) {
  return esEmailPlaceholder(email);
}

/**
 * Si una pasada anterior copió el nombre largo a la cuenta de login,
 * volver al nombre corto que se usa en operación.
 * Solo escribe si el nombre actual coincide con `desde` (idempotente).
 */
export const REVERTIR_A_NOMBRE_CORTO = [
  { email: 'jose.fonseca@parkdalemills.com', desde: 'Jose Isai Fonseca Vivas', hacia: 'Jose Isai Fonseca' },
  { email: 'jorge.lara@parkdalemills.com', desde: 'Jorge Alejandro Lara Velez', hacia: 'Jorge Lara' },
  { email: 'juan.ocampo@parkdalemills.com', desde: 'Juan Carlos Ocampo Reyna', hacia: 'Juan Ocampo' },
  { email: 'juan.camacho@parkdalemills.com', desde: 'Juan Manuel Camacho Herrera', hacia: 'Juan Camacho' },
  { email: 'dulce.velazquez@parkdalemills.com', desde: 'Dulce Amaranta Velazquez', hacia: 'Dulce Velazquez' },
  { email: 'lisbeth.linares@parkdalemills.com', desde: 'Elda Lizbeth Linares', hacia: 'Lisbeth Linares' },
];

const FK_USUARIO = [
  ['requerimientos', 'solicitante_id'],
  ['ordenes_compra', 'autorizado_por'],
  ['recepciones', 'recibido_por'],
  ['historial_estados', 'cambiado_por'],
  ['configuracion_smtp', 'updated_by'],
  ['configuracion_app', 'updated_by'],
];

const FK_NULLABLE = [
  ['historial_estados', 'cambiado_por'],
  ['configuracion_smtp', 'updated_by'],
  ['configuracion_app', 'updated_by'],
];

const FK_OBLIGATORIAS = [
  ['requerimientos', 'solicitante_id'],
  ['ordenes_compra', 'autorizado_por'],
  ['recepciones', 'recibido_por'],
];

export function normalizarNombre(nombre) {
  return String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokensNombre(nombre) {
  return normalizarNombre(nombre)
    .split(' ')
    .filter((t) => t.length >= 3);
}

export function distanciaLevenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  const m = s.length;
  const n = t.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** Mismo token, o typo de 1 carácter en palabras de 5+ letras (lisbeth/lizbeth). */
export function tokensEquivalentes(a, b) {
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5 && distanciaLevenshtein(a, b) <= 1) return true;
  return false;
}

export function tokensContenidosEn(corto, largo) {
  if (!corto.length || !largo.length) return false;
  return corto.every((t) => largo.some((u) => tokensEquivalentes(t, u)));
}

export function interseccionTokens(a, b) {
  return a.filter((t) => b.some((u) => tokensEquivalentes(t, u)));
}

export function nombreMasCompleto(a, b) {
  const ta = tokensNombre(a);
  const tb = tokensNombre(b);
  if (ta.length !== tb.length) return ta.length > tb.length ? a : b;
  const na = String(a || '').trim();
  const nb = String(b || '').trim();
  return na.length >= nb.length ? na : nb;
}

function esActivo(u) {
  return Number(u.activo) === 1 || u.activo === true;
}

function puntuacionCanonica(u) {
  let s = 0;
  if (esActivo(u)) s += 100;
  if (!esEmailImport(u.email)) s += 50;
  s += Number(u.n_req) || 0;
  return s;
}

/**
 * Elige la cuenta de login (canónica) y la que se fusiona.
 * No fusiona dos cuentas activas con correo real (homónimos).
 */
export function elegirCanonicaYDuplicado(a, b) {
  const ambosActivosReales = esActivo(a) && esActivo(b)
    && !esEmailImport(a.email) && !esEmailImport(b.email);
  if (ambosActivosReales) {
    return { canonica: null, duplicado: null, omitir: 'ambos_activos' };
  }

  const sa = puntuacionCanonica(a);
  const sb = puntuacionCanonica(b);
  if (sa !== sb) {
    return sa > sb
      ? { canonica: a, duplicado: b, omitir: null }
      : { canonica: b, duplicado: a, omitir: null };
  }
  if (esEmailImport(a.email) !== esEmailImport(b.email)) {
    return esEmailImport(a.email)
      ? { canonica: b, duplicado: a, omitir: null }
      : { canonica: a, duplicado: b, omitir: null };
  }
  const menor = Number(a.id) <= Number(b.id) ? a : b;
  const mayor = menor === a ? b : a;
  return { canonica: menor, duplicado: mayor, omitir: null };
}

function evaluarPar(a, b) {
  const ta = tokensNombre(a.nombre);
  const tb = tokensNombre(b.nombre);
  if (ta.length < 2 || tb.length < 2) return null;

  const same = normalizarNombre(a.nombre) === normalizarNombre(b.nombre);
  const aEnB = tokensContenidosEn(ta, tb);
  const bEnA = tokensContenidosEn(tb, ta);
  if (!same && !aEnB && !bEnA) return null;

  const inter = interseccionTokens(ta, tb);
  if (!same && inter.length < 2) return null;

  // El más corto debe caber entero en el largo (o son el mismo nombre).
  const corto = ta.length <= tb.length ? ta : tb;
  const largo = ta.length <= tb.length ? tb : ta;
  if (!same && !tokensContenidosEn(corto, largo)) return null;

  const { canonica, duplicado, omitir } = elegirCanonicaYDuplicado(a, b);
  if (omitir) {
    return {
      a,
      b,
      score: 0,
      omitir,
      canonica: null,
      duplicado: null,
      nombreNuevo: null,
    };
  }

  // Mismo nombre ya unificado: no rehacer el par si el duplicado no tiene
  // historial ni es placeholder de import.
  if (same) {
    const hayMerge = esEmailImport(duplicado.email) || Number(duplicado.n_req) > 0;
    if (!hayMerge) return null;
  }

  const score = (same ? 80 : 0) + inter.length * 10 + Math.abs(ta.length - tb.length);
  return {
    a,
    b,
    canonica,
    duplicado,
    nombreNuevo: canonica.nombre,
    score,
    omitir: null,
  };
}

/** Usuarios cuyo nombre de login se alargó por error y hay que devolver al corto. */
export function planRevertirNombresCortos(usuarios) {
  const byEmail = new Map(
    (usuarios || []).map((u) => [String(u.email || '').toLowerCase(), u])
  );
  const plan = [];
  for (const r of REVERTIR_A_NOMBRE_CORTO) {
    const u = byEmail.get(String(r.email).toLowerCase());
    if (!u) continue;
    if (normalizarNombre(u.nombre) !== normalizarNombre(r.desde)) continue;
    plan.push({
      usuario: u,
      nombreAnterior: u.nombre,
      nombreNuevo: recortarNombre(r.hacia),
      email: r.email,
    });
  }
  return plan;
}

/**
 * Pares únicos corto↔completo. Si un usuario coincide con dos personas,
 * se omite (no adivinar homónimos).
 *
 * @param {Array<{id:number,nombre:string,email:string,activo:any,n_req?:number}>} usuarios
 */
export function detectarParesNombres(usuarios) {
  const list = Array.isArray(usuarios) ? usuarios : [];
  const candidatos = [];

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const ev = evaluarPar(list[i], list[j]);
      if (ev) candidatos.push(ev);
    }
  }

  const partners = new Map();
  for (const p of candidatos) {
    if (p.omitir) continue;
    const ia = Number(p.a.id);
    const ib = Number(p.b.id);
    if (!partners.has(ia)) partners.set(ia, new Set());
    if (!partners.has(ib)) partners.set(ib, new Set());
    partners.get(ia).add(ib);
    partners.get(ib).add(ia);
  }

  const ambiguos = new Set(
    [...partners.entries()].filter(([, s]) => s.size > 1).map(([id]) => id)
  );

  const pares = [];
  const omitidos = [];

  for (const p of candidatos) {
    if (p.omitir) {
      omitidos.push(p);
      continue;
    }
    const ia = Number(p.a.id);
    const ib = Number(p.b.id);
    if (ambiguos.has(ia) || ambiguos.has(ib)) {
      omitidos.push({ ...p, omitir: 'ambiguo' });
      continue;
    }
    pares.push(p);
  }

  pares.sort((x, y) => y.score - x.score || Number(x.canonica.id) - Number(y.canonica.id));
  return { pares, omitidos, ambiguos: [...ambiguos] };
}

function recortarNombre(nombre) {
  return String(nombre || '').trim().slice(0, NOMBRE_MAX);
}

async function execSilent(conn, sql, params) {
  try {
    const [r] = await conn.query(sql, params);
    return r;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR') return null;
    throw err;
  }
}

async function reasignarFks(conn, fromId, toId) {
  const detalle = {};
  let total = 0;
  for (const [tabla, col] of FK_USUARIO) {
    const r = await execSilent(
      conn,
      `UPDATE \`${tabla}\` SET \`${col}\` = ? WHERE \`${col}\` = ?`,
      [toId, fromId]
    );
    const n = r?.affectedRows || 0;
    detalle[`${tabla}.${col}`] = n;
    total += n;
  }
  return { total, detalle };
}

async function contarRefs(conn, userId, lista = FK_USUARIO) {
  let n = 0;
  for (const [tabla, col] of lista) {
    const r = await execSilent(
      conn,
      `SELECT COUNT(*) AS cnt FROM \`${tabla}\` WHERE \`${col}\` = ?`,
      [userId]
    );
    n += Number(r?.[0]?.cnt) || 0;
  }
  return n;
}

async function anularFksNulables(conn, userId) {
  for (const [tabla, col] of FK_NULLABLE) {
    await execSilent(
      conn,
      `UPDATE \`${tabla}\` SET \`${col}\` = NULL WHERE \`${col}\` = ?`,
      [userId]
    );
  }
}

async function eliminarPlaceholderSiLibre(conn, userId) {
  await anularFksNulables(conn, userId);
  const refs = await contarRefs(conn, userId, FK_OBLIGATORIAS);
  if (refs > 0) return false;
  const [r] = await conn.query(
    `DELETE FROM usuarios
     WHERE id = ?
       AND (email LIKE ? OR email LIKE ?)`,
    [userId, '%@import.local', 'sin-correo.%']
  );
  return (r?.affectedRows || 0) > 0;
}

/** Placeholders de import que no entraron en un par corto↔largo. */
export function placeholdersHuerfanos(usuarios, pares = []) {
  const ya = new Set(
    (pares || []).flatMap((p) => [Number(p.duplicado?.id), Number(p.canonica?.id)])
  );
  return (usuarios || []).filter((u) => {
    if (!esEmailPlaceholder(u.email)) return false;
    if (ya.has(Number(u.id))) return false;
    return true;
  });
}

/**
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function aplicarCorreccionNombres(db, { dryRun = true } = {}) {
  const [usuarios] = await db.query(`
    SELECT u.id, u.nombre, u.email, u.rol, u.activo,
      (SELECT COUNT(*) FROM requerimientos r WHERE r.solicitante_id = u.id) AS n_req
    FROM usuarios u
  `);

  const { pares, omitidos } = detectarParesNombres(usuarios);
  const reverts = planRevertirNombresCortos(usuarios);
  const cambios = [];

  const plan = pares.map((p) => {
    const eliminarPlaceholder = esEmailPlaceholder(p.duplicado.email);
    const reqsAMover = Number(p.duplicado.n_req) || 0;
    if (!eliminarPlaceholder && reqsAMover === 0) return null;
    return {
      canonica: p.canonica,
      duplicado: p.duplicado,
      nombreAnterior: p.canonica.nombre,
      nombreNuevo: p.canonica.nombre,
      renombrar: false,
      reqsAMover,
      eliminarPlaceholder,
      huerfano: false,
      score: p.score,
    };
  }).filter(Boolean);

  for (const ph of placeholdersHuerfanos(usuarios, pares)) {
    if (Number(ph.n_req) > 0) continue;
    plan.push({
      canonica: null,
      duplicado: ph,
      nombreAnterior: ph.nombre,
      nombreNuevo: ph.nombre,
      renombrar: false,
      reqsAMover: 0,
      eliminarPlaceholder: true,
      huerfano: true,
      score: 0,
    });
  }

  const resumenBase = {
    pares: plan.filter((c) => !c.huerfano).length,
    aRevertir: reverts.length,
    aRenombrar: 0,
    reqs: plan.reduce((s, c) => s + c.reqsAMover, 0),
    aEliminar: plan.filter((c) => c.eliminarPlaceholder).length,
    omitidos: omitidos.length,
  };

  if (dryRun) {
    return {
      dryRun: true,
      plan,
      reverts,
      omitidos: omitidos.map((o) => ({
        a: o.a,
        b: o.b,
        omitir: o.omitir,
      })),
      resumen: resumenBase,
    };
  }

  const ownConn = typeof db.getConnection === 'function';

  for (const r of reverts) {
    const conn = ownConn ? await db.getConnection() : db;
    try {
      if (ownConn) await conn.beginTransaction();
      await conn.query('UPDATE usuarios SET nombre = ? WHERE id = ?', [
        r.nombreNuevo,
        r.usuario.id,
      ]);
      if (ownConn) await conn.commit();
    } catch (err) {
      if (ownConn) await conn.rollback();
      throw err;
    } finally {
      if (ownConn) conn.release();
    }
  }

  for (const item of plan) {
    const conn = ownConn ? await db.getConnection() : db;
    let fks = { total: 0, detalle: {} };
    let eliminado = false;
    let error = null;
    try {
      if (ownConn) await conn.beginTransaction();
      const fromId = item.duplicado.id;
      if (item.canonica && Number(item.canonica.id) !== Number(fromId)) {
        fks = await reasignarFks(conn, fromId, item.canonica.id);
      }
      if (item.eliminarPlaceholder) {
        eliminado = await eliminarPlaceholderSiLibre(conn, fromId);
      }
      if (ownConn) await conn.commit();
    } catch (err) {
      if (ownConn) await conn.rollback();
      error = err.message;
    } finally {
      if (ownConn) conn.release();
    }
    cambios.push({
      ...item,
      nombreAplicado: item.canonica?.nombre || item.duplicado.nombre,
      fks,
      eliminado,
      error,
    });
  }

  return {
    dryRun: false,
    plan: cambios,
    reverts,
    omitidos: omitidos.map((o) => ({ a: o.a, b: o.b, omitir: o.omitir })),
    resumen: {
      ...resumenBase,
      aEliminar: cambios.filter((c) => c.eliminado).length,
      reqs: cambios.reduce((s, c) => s + (c.fks?.detalle?.['requerimientos.solicitante_id'] || 0), 0),
    },
  };
}
