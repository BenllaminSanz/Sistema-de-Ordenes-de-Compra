import pool from '../config/db.js';

const EMAIL_PLACEHOLDER = /@import\.local$/i;

let cache = null;

function esUrlHttp(valor) {
  const url = String(valor || '').trim().replace(/\/$/, '');
  return /^https?:\/\/[^\s]+$/i.test(url) ? url : '';
}

function esLocalhost(url) {
  return /localhost|127\.0\.0\.1/i.test(String(url || ''));
}

function splitEmails(raw) {
  return String(raw || '')
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@'));
}

function frontendUrlDesdeEnv() {
  const candidatos = [
    process.env.FRONTEND_URL,
    process.env.PUBLIC_APP_URL,
    process.env.CORS_ORIGIN,
  ];
  for (const raw of candidatos) {
    const url = esUrlHttp(raw);
    if (!url) continue;
    if (esLocalhost(url) && process.env.NODE_ENV === 'production') continue;
    return url;
  }
  return 'http://localhost:3000';
}

export function frontendUrlEfectiva(ajustes) {
  const dbUrl = esUrlHttp(ajustes?.frontend_url);
  if (dbUrl) return dbUrl;
  return frontendUrlDesdeEnv();
}

export function getAjustesCorreoCache() {
  return cache;
}

export function invalidarAjustesCorreoCache() {
  cache = null;
}

const ROLES_NOTIF = ['compras', 'admin'];

function parseRolesNotif(raw) {
  const lista = String(raw || '')
    .split(/[,;\s]+/)
    .map((s) => (s === 'contabilidad' ? 'compras' : s.trim().toLowerCase()))
    .filter((s) => ROLES_NOTIF.includes(s));
  return lista.length ? [...new Set(lista)] : ['compras', 'admin'];
}

function serializarRolesNotif(roles) {
  return parseRolesNotif(Array.isArray(roles) ? roles.join(',') : roles).join(',');
}

const DEFAULTS = {
  frontend_url: '',
  notif_req_revision: true,
  email_notif_compras: '',
  notif_roles: ['compras', 'admin'],
  reporte_diario: true,
  reporte_diario_ultimo: null,
  updated_at: null,
};

export async function obtenerAjustesCorreo() {
  if (cache) return cache;
  try {
    const [[row]] = await pool.query(
      `SELECT frontend_url, notif_req_revision, email_notif_compras, notif_roles,
              reporte_diario, reporte_diario_ultimo, updated_at
       FROM configuracion_app
       WHERE id = 1
       LIMIT 1`
    );
    cache = {
      frontend_url: row?.frontend_url || '',
      notif_req_revision: row ? Number(row.notif_req_revision) !== 0 : true,
      email_notif_compras: row?.email_notif_compras || '',
      notif_roles: parseRolesNotif(row?.notif_roles),
      reporte_diario: row ? Number(row.reporte_diario) !== 0 : true,
      reporte_diario_ultimo: row?.reporte_diario_ultimo
        ? String(row.reporte_diario_ultimo).slice(0, 10)
        : null,
      updated_at: row?.updated_at || null,
    };
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE' || err?.code === 'ER_BAD_FIELD_ERROR') {
      cache = { ...DEFAULTS };
    } else {
      throw err;
    }
  }
  return cache;
}

export async function guardarAjustesCorreo(datos = {}, updatedById = null) {
  const actual = await obtenerAjustesCorreo();
  const frontend_url = datos.frontend_url !== undefined
    ? esUrlHttp(datos.frontend_url)
    : (actual.frontend_url || '');
  const notif_req_revision = datos.notif_req_revision !== undefined
    ? !!datos.notif_req_revision
    : actual.notif_req_revision;
  const email_notif_compras = datos.email_notif_compras !== undefined
    ? String(datos.email_notif_compras || '').trim()
    : (actual.email_notif_compras || '');
  const notif_roles = datos.notif_roles !== undefined
    ? parseRolesNotif(datos.notif_roles)
    : (actual.notif_roles || DEFAULTS.notif_roles);
  const reporte_diario = datos.reporte_diario !== undefined
    ? !!datos.reporte_diario
    : (actual.reporte_diario !== false);

  if (datos.frontend_url !== undefined && datos.frontend_url && !frontend_url) {
    throw Object.assign(new Error('La URL pública debe empezar con http:// o https://'), { status: 400 });
  }
  if (datos.notif_roles !== undefined && !notif_roles.length) {
    throw Object.assign(new Error('Elige al menos un rol: Compras o Admin'), { status: 400 });
  }

  const updatedBy = Number.isInteger(Number(updatedById)) ? Number(updatedById) : null;

  await pool.query(
    `INSERT INTO configuracion_app
       (id, frontend_url, notif_req_revision, email_notif_compras, notif_roles, reporte_diario, updated_by)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       frontend_url = VALUES(frontend_url),
       notif_req_revision = VALUES(notif_req_revision),
       email_notif_compras = VALUES(email_notif_compras),
       notif_roles = VALUES(notif_roles),
       reporte_diario = VALUES(reporte_diario),
       updated_by = VALUES(updated_by)`,
    [
      frontend_url || null,
      notif_req_revision ? 1 : 0,
      email_notif_compras || null,
      serializarRolesNotif(notif_roles),
      reporte_diario ? 1 : 0,
      updatedBy,
    ]
  );

  cache = null;
  return obtenerAjustesCorreo();
}

/**
 * Destinatarios de "REQ en revisión": usuarios compras/admin activos + extras.
 */
export async function listarDestinatariosNotif(ajustes) {
  const cfg = ajustes || await obtenerAjustesCorreo();
  const roles = parseRolesNotif(cfg.notif_roles);
  if (!roles.length) return [];

  const placeholders = roles.map(() => '?').join(', ');
  const [usuarios] = await pool.query(
    `SELECT id, nombre, email, rol
     FROM usuarios
     WHERE activo = 1
       AND rol IN (${placeholders})
       AND email IS NOT NULL AND TRIM(email) <> ''
       AND email NOT LIKE '%@import.local'`,
    roles
  );

  const destinos = [];
  const seen = new Set();

  for (const u of usuarios || []) {
    const email = String(u.email || '').trim().toLowerCase();
    if (!email || EMAIL_PLACEHOLDER.test(email) || seen.has(email)) continue;
    seen.add(email);
    destinos.push({
      email,
      nombre: u.nombre || '',
      rol: u.rol,
      origen: 'usuario',
    });
  }

  const extras = [
    ...splitEmails(cfg.email_notif_compras),
    ...splitEmails(process.env.EMAIL_NOTIF_COMPRAS),
  ];
  for (const email of extras) {
    if (seen.has(email)) continue;
    seen.add(email);
    destinos.push({
      email,
      nombre: '',
      rol: null,
      origen: 'extra',
    });
  }

  return destinos;
}

export function fechaHoyMexico() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function marcarReporteDiarioEnviado(dia = fechaHoyMexico()) {
  const ymd = String(dia).slice(0, 10);
  await pool.query(
    `INSERT INTO configuracion_app (id, reporte_diario_ultimo)
     VALUES (1, ?)
     ON DUPLICATE KEY UPDATE reporte_diario_ultimo = VALUES(reporte_diario_ultimo)`,
    [ymd]
  );
  if (cache) cache.reporte_diario_ultimo = ymd;
  return ymd;
}

export function urlPublicaDesdeRequest(req) {
  if (!req) return '';
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const host = String(req.headers['x-forwarded-host'] || req.get?.('host') || '')
    .split(',')[0]
    .trim();
  if (!host) return '';
  return `${proto}://${host}`.replace(/\/$/, '');
}

export { esLocalhost };
