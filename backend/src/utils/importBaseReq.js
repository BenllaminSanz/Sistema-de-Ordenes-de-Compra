/**
 * Carga histórica de requerimientos desde Excel (layout BASE GRAL / legacy).
 * - Valida catálogo (si no existe → ítem libre + nota)
 * - Usuarios inexistentes → crea inactivos (solo nombre, email placeholder)
 * - Duplicados de consecutivo → se omite el segundo (error reportado)
 * - Sufijos A/B/C en consecutivo son válidos (partición de OC)
 * - Crea OC cuando el Estado Excel lo indica (sin cotizaciones)
 */

import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { parseExcelRequerimientos, extraerCodigoDesdeDescripcion } from './excelRequerimientos.js';
import { sincronizarConsecutivosControl } from './consecutivos.js';
import logger from './logger.js';

const EMAIL_PLACEHOLDER_DOMAIN = 'import.local';
const PASSWORD_PLACEHOLDER = 'IMPORT-NO-LOGIN-DISABLED';

function slugNombre(nombre) {
  return String(nombre || 'usuario')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40) || 'usuario';
}

function camposTituloNotas(f) {
  const titulo = String(f.titulo || f.descripcion || f.consecutivo || '')
    .trim()
    .slice(0, 300);
  const notas = String(f.status_texto != null ? f.status_texto : (f.notas || ''))
    .trim()
    .slice(0, 4000);
  return { titulo: titulo || String(f.consecutivo || '').slice(0, 300), notas };
}

function parseProveedorExcel(texto) {
  const s = String(texto || '').trim();
  if (!s) return { num: null, nombre: null, raw: '' };
  // "155-RIETER..." o "25374-SONOCO..."
  const m = s.match(/^(\d{1,8})\s*[-–—]\s*(.+)$/);
  if (m) return { num: m[1].padStart(5, '0').slice(-5), nombre: m[2].trim(), raw: s };
  return { num: null, nombre: s, raw: s };
}

/**
 * Borra flujo operativo REQ/OC/recepciones/cotizaciones.
 * Conserva: usuarios, catálogo, proveedores, áreas, SMTP.
 * Nota: las cotizaciones existentes se eliminan por FK (no se pueden conservar sin REQ).
 */
export async function wipeFlujoReqOc(conn = null) {
  const db = conn || pool;
  const own = !conn;
  if (own) {
    // usar conexión con transacción
  }
  const c = own ? await pool.getConnection() : conn;
  try {
    if (own) await c.beginTransaction();

    await c.query('SET FOREIGN_KEY_CHECKS = 0');
    await c.query('DELETE FROM recepcion_items');
    await c.query('DELETE FROM recepciones');
    await c.query(
      `DELETE FROM historial_estados
       WHERE entidad_tipo IN ('requerimiento','orden_compra','recepcion','cotizacion')`
    );
    await c.query('DELETE FROM cotizacion_items');
    await c.query('DELETE FROM cotizaciones');
    await c.query('UPDATE requerimientos SET orden_compra_id = NULL');
    await c.query('DELETE FROM ordenes_compra');
    await c.query('DELETE FROM requerimiento_items');
    await c.query('DELETE FROM requerimiento_items_libres');
    await c.query('DELETE FROM requerimientos');
    await c.query('DELETE FROM consecutivos_control');
    await c.query('SET FOREIGN_KEY_CHECKS = 1');

    if (own) await c.commit();
    return { ok: true };
  } catch (err) {
    if (own) await c.rollback();
    throw err;
  } finally {
    if (own) c.release();
  }
}

function normalizarNombreUsuario(nombre) {
  return String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensNombreUsuario(nombre) {
  return normalizarNombreUsuario(nombre)
    .split(' ')
    .filter((t) => t.length >= 3);
}

/**
 * Alias fijos Excel → cuenta real del sistema (casos validados a mano).
 * Evita crear un segundo usuario cuando BASE GRAL trae nombre completo
 * y en el sistema está el nombre corto / correo corporativo.
 *
 * Ampliar aquí solo casos confirmados (no adivinar homónimos).
 */
const ALIAS_USUARIO_IMPORT = [
  {
    // Caso: login "Isai Fonseca" / "Jose Isai Fonseca" vs Excel "Jose Isai Fonseca Vivas"
    patrones: [
      'jose isai fonseca',
      'jose isai fonseca vivas',
      'isai fonseca',
      'isai fonseca vivas',
    ],
    email: 'jose.fonseca@parkdalemills.com',
    nombresSistema: ['jose isai fonseca', 'isai fonseca'],
  },
  {
    patrones: ['dulce amaranta velazquez', 'dulce velazquez'],
    email: 'dulce.velazquez@parkdalemills.com',
    nombresSistema: ['dulce velazquez', 'dulce amaranta velazquez'],
  },
  {
    patrones: ['jorge alejandro lara velez', 'jorge lara'],
    email: 'jorge.lara@parkdalemills.com',
    nombresSistema: ['jorge lara', 'jorge alejandro lara velez'],
  },
  {
    patrones: ['juan manuel camacho herrera', 'juan camacho'],
    email: 'juan.camacho@parkdalemills.com',
    nombresSistema: ['juan camacho', 'juan manuel camacho herrera'],
  },
  {
    patrones: ['juan carlos ocampo reyna', 'juan ocampo'],
    email: 'juan.ocampo@parkdalemills.com',
    nombresSistema: ['juan ocampo', 'juan carlos ocampo reyna'],
  },
  {
    patrones: ['elda lizbeth linares', 'lisbeth linares', 'lizbeth linares'],
    email: 'lisbeth.linares@parkdalemills.com',
    nombresSistema: ['lisbeth linares', 'elda lizbeth linares'],
  },
];

function buscarUsuarioPorAlias(rows, excelNombre) {
  const lower = normalizarNombreUsuario(excelNombre);
  if (!lower) return null;

  for (const alias of ALIAS_USUARIO_IMPORT) {
    const coincide = alias.patrones.some((p) => {
      const pn = normalizarNombreUsuario(p);
      if (lower === pn) return true;
      // Excel más largo: todos los tokens del patrón están en el nombre del Excel
      const pt = tokensNombreUsuario(pn);
      if (pt.length < 2) return false;
      return pt.every((t) => lower.split(' ').includes(t));
    });
    if (!coincide) continue;

    // 1) Por correo corporativo (más fiable)
    if (alias.email) {
      const porEmail = rows.find(
        (u) => String(u.email || '').toLowerCase() === alias.email.toLowerCase()
      );
      if (porEmail) return porEmail;
    }
    // 2) Por nombre ya registrado en el sistema
    for (const ns of alias.nombresSistema || []) {
      const nn = normalizarNombreUsuario(ns);
      const porNombre = rows.find((u) => normalizarNombreUsuario(u.nombre) === nn);
      if (porNombre) return porNombre;
    }
  }
  return null;
}

async function cargarMapaUsuarios(db) {
  const [rows] = await db.query('SELECT id, nombre, email, activo FROM usuarios');
  const byFull = new Map();
  for (const u of rows) {
    byFull.set(normalizarNombreUsuario(u.nombre), u);
  }
  return { rows, byFull };
}

/**
 * Empareja el nombre del Excel con un usuario existente.
 * 1) Alias fijos validados (p. ej. Jose Isai Fonseca)
 * 2) Coincidencia exacta (normalizada)
 * 3) Nombre corto ↔ nombre largo por tokens (fuzzy)
 * Prefiere usuarios activos cuando hay varios candidatos.
 */
function matchUsuario(cache, excelNombre) {
  if (!excelNombre) return null;
  const { byFull, rows } = cache;

  // 1) Casos fijos (actualización / reimport)
  const porAlias = buscarUsuarioPorAlias(rows || [], excelNombre);
  if (porAlias) return porAlias;

  const lower = normalizarNombreUsuario(excelNombre);
  if (byFull.has(lower)) return byFull.get(lower);

  const tokensExcel = tokensNombreUsuario(excelNombre);
  if (!tokensExcel.length) return null;

  let best = null;
  let bestScore = 0;

  for (const [k, u] of byFull.entries()) {
    const tokensExist = tokensNombreUsuario(k);
    if (!tokensExist.length) continue;

    const setExcel = new Set(tokensExcel);
    const setExist = new Set(tokensExist);
    const inter = tokensExist.filter((t) => setExcel.has(t));
    if (!inter.length) continue;

    // Todos los tokens del nombre más corto deben estar en el más largo
    const corto = tokensExist.length <= tokensExcel.length ? tokensExist : tokensExcel;
    const largoSet = tokensExist.length <= tokensExcel.length ? setExcel : setExist;
    const coberturaCorto = corto.filter((t) => largoSet.has(t)).length / corto.length;
    if (coberturaCorto < 1) continue;
    if (inter.length < 2 && corto.length > 1) continue;

    let score = inter.length * 10 + coberturaCorto * 5;
    if (Number(u.activo) === 1) score += 50; // preferir cuenta real de login
    if (score > bestScore) {
      bestScore = score;
      best = u;
    }
  }

  // Umbral: al menos 2 tokens compartidos (score base 20)
  if (best && bestScore >= 20) return best;
  return null;
}

async function asegurarUsuarioInactivo(db, nombre, cache, reporte) {
  const existing = matchUsuario(cache, nombre);
  if (existing) return existing.id;

  const slug = slugNombre(nombre);
  let email = `sin-correo.${slug}@${EMAIL_PLACEHOLDER_DOMAIN}`;
  let n = 1;
  while (cache.rows.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    n += 1;
    email = `sin-correo.${slug}.${n}@${EMAIL_PLACEHOLDER_DOMAIN}`;
  }

  const hash = await bcrypt.hash(PASSWORD_PLACEHOLDER, 8);
  const [result] = await db.query(
    `INSERT INTO usuarios
       (nombre, email, password_hash, rol, email_verificado, activo)
     VALUES (?, ?, ?, 'solicitante', 0, 0)`,
    [nombre.slice(0, 120), email, hash]
  );
  const user = {
    id: result.insertId,
    nombre: nombre.slice(0, 120),
    email,
    activo: 0,
  };
  cache.rows.push(user);
  cache.byFull.set(normalizarNombreUsuario(user.nombre), user);
  reporte.usuariosCreados.push({ id: user.id, nombre: user.nombre, email: user.email });
  return user.id;
}

async function cargarCatalogoPorCodigo(db) {
  const [rows] = await db.query('SELECT id, codigo, descripcion, unidad, proveedor_id FROM catalogo');
  const byCode = new Map();
  for (const r of rows) {
    byCode.set(String(r.codigo).trim().toUpperCase(), r);
  }
  return byCode;
}

async function cargarProveedores(db) {
  const [rows] = await db.query('SELECT id, num_proveedor, nombre FROM proveedores');
  const byNum = new Map();
  const byNombre = new Map();
  for (const p of rows) {
    if (p.num_proveedor) byNum.set(String(p.num_proveedor).trim(), p);
    if (p.nombre) byNombre.set(p.nombre.toLowerCase().trim(), p);
  }
  return { byNum, byNombre };
}

function resolverProveedorId(mapa, proveedorTexto) {
  const { num, nombre } = parseProveedorExcel(proveedorTexto);
  if (num && mapa.byNum.has(num)) return mapa.byNum.get(num).id;
  // intentar sin pad
  if (num) {
    const raw = String(num).replace(/^0+/, '');
    for (const [k, p] of mapa.byNum.entries()) {
      if (String(k).replace(/^0+/, '') === raw) return p.id;
    }
  }
  if (nombre && mapa.byNombre.has(nombre.toLowerCase())) {
    return mapa.byNombre.get(nombre.toLowerCase()).id;
  }
  return null;
}

/**
 * Sincroniza consecutivos_control incluyendo sufijos A/B/C (toma la parte numérica).
 */
export async function sincronizarConsecutivosConSufijos(db) {
  // Base estándar
  try {
    await sincronizarConsecutivosControl(db);
  } catch (e) {
    logger.warn('[import] sincronizarConsecutivosControl', e.message);
  }

  const [rows] = await db.query(
    `SELECT consecutivo, tipo FROM requerimientos WHERE consecutivo IS NOT NULL AND consecutivo <> ''`
  );
  const maxMap = new Map(); // key anio|tipo -> max num
  for (const r of rows) {
    const m = String(r.consecutivo).trim().match(/^(\d{4})([PSF])-(\d+)/i);
    if (!m) continue;
    const anio = parseInt(m[1], 10);
    const letra = m[2].toUpperCase();
    const tipo = letra === 'P' ? 'PARTES' : letra === 'F' ? 'FLETES' : 'SERVICIOS';
    const num = parseInt(m[3], 10);
    const key = `${anio}|${tipo}`;
    maxMap.set(key, Math.max(maxMap.get(key) || 0, num));
  }

  for (const [key, maximo] of maxMap.entries()) {
    const [anio, tipo] = key.split('|');
    await db.query(
      `INSERT INTO consecutivos_control (anio, tipo, ultimo_numero)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE ultimo_numero = GREATEST(ultimo_numero, VALUES(ultimo_numero))`,
      [parseInt(anio, 10), tipo, maximo]
    );
  }
}

/**
 * Importa filas ya parseadas (o buffer Excel).
 * @param {object} opts
 * @param {Buffer} [opts.buffer]
 * @param {object[]} [opts.filas]
 * @param {object[]} [opts.duplicados]
 * @param {number} opts.actorUserId - usuario que ejecuta (historial / autorizado_por)
 * @param {boolean} [opts.wipe=false]
 * @param {boolean} [opts.dryRun=false]
 */
export async function importarBaseRequerimientos(opts = {}) {
  const {
    buffer,
    actorUserId,
    wipe = false,
    dryRun = false,
  } = opts;

  if (!actorUserId) throw new Error('actorUserId es requerido');

  let filas = opts.filas;
  let duplicados = opts.duplicados || [];
  let parseMeta = null;

  if (buffer) {
    const parsed = parseExcelRequerimientos(buffer);
    filas = parsed.filas;
    duplicados = parsed.duplicados;
    parseMeta = {
      layout: parsed.layout,
      hojasSaltadas: parsed.hojasSaltadas,
      meta: parsed.meta,
    };
  }

  if (!filas?.length) {
    return {
      ok: false,
      mensaje: 'No hay filas válidas para importar',
      parseMeta,
      duplicados,
    };
  }

  const reporte = {
    dryRun,
    wipe,
    totalFilas: filas.length,
    importados: 0,
    saltados: 0, // legado: ya no se omiten; se actualizan título/notas
    actualizados: 0, // N° existentes: se pisa título (descripción) y notas (Status)
    ocsCreadas: 0,
    itemsCatalogo: 0,
    itemsLibres: 0,
    sinCatalogo: [],
    usuariosCreados: [],
    duplicados: duplicados.map((d) => ({
      consecutivo: d.consecutivo,
      filaExcel: d.filaExcel,
      originalFila: d.originalFila,
      motivo: d.motivo,
    })),
    errores: [],
    porEstadoReq: {},
    porEstadoOc: {},
    parseMeta,
  };

  if (dryRun) {
    // Solo simular validaciones de catálogo/usuarios
    const catalogo = await cargarCatalogoPorCodigo(pool);
    const users = await cargarMapaUsuarios(pool);
    const [existentesDry] = wipe
      ? [[]]
      : await pool.query('SELECT consecutivo FROM requerimientos WHERE consecutivo IS NOT NULL');
    const existDry = new Set(
      (existentesDry || []).map((r) => String(r.consecutivo).trim().toUpperCase())
    );
    for (const f of filas) {
      const key = String(f.consecutivo).trim().toUpperCase();
      if (existDry.has(key)) reporte.actualizados += 1;
      else reporte.importados += 1;
      reporte.porEstadoReq[f.reqEstado] = (reporte.porEstadoReq[f.reqEstado] || 0) + 1;
      if (f.crearOc && !existDry.has(key)) {
        reporte.porEstadoOc[f.ocEstado] = (reporte.porEstadoOc[f.ocEstado] || 0) + 1;
      }
      if (f.usuario && !matchUsuario(users, f.usuario)) {
        reporte.usuariosCreados.push({ nombre: f.usuario, pendiente: true });
      }
      const code = f.codigo_sugerido || extraerCodigoDesdeDescripcion(f.descripcion);
      if (code) {
        if (catalogo.has(String(code).toUpperCase())) reporte.itemsCatalogo += 1;
        else {
          reporte.itemsLibres += 1;
          if (reporte.sinCatalogo.length < 50) {
            reporte.sinCatalogo.push({ consecutivo: f.consecutivo, codigo: code, desc: (f.descripcion || '').slice(0, 80) });
          }
        }
      } else {
        reporte.itemsLibres += 1;
      }
    }
    // unique pending users
    const seenU = new Set();
    reporte.usuariosCreados = reporte.usuariosCreados.filter((u) => {
      const k = u.nombre.toLowerCase();
      if (seenU.has(k)) return false;
      seenU.add(k);
      return true;
    });
    reporte.ocsCreadas = filas.filter((f) => f.crearOc).length;
    reporte.mensaje =
      `Dry-run: ${reporte.importados} REQ nuevos, ${reporte.actualizados} a actualizar (título/notas)` +
      `, ${reporte.ocsCreadas} OC, ${reporte.duplicados.length} duplicados omitidos` +
      `, ${reporte.usuariosCreados.length} usuarios a crear`;
    reporte.ok = true;
    return reporte;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (wipe) {
      await wipeFlujoReqOc(conn);
    }

    const userCache = await cargarMapaUsuarios(conn);
    const catalogo = await cargarCatalogoPorCodigo(conn);
    const proveedores = await cargarProveedores(conn);

    const [existentes] = await conn.query(
      'SELECT id, consecutivo FROM requerimientos WHERE consecutivo IS NOT NULL'
    );
    const existMap = new Map(
      existentes.map((r) => [String(r.consecutivo).trim().toUpperCase(), r.id])
    );

    for (const f of filas) {
      const key = String(f.consecutivo).trim().toUpperCase();
      if (existMap.has(key)) {
        try {
          const reqId = existMap.get(key);
          const { titulo, notas } = camposTituloNotas(f);
          await conn.query(
            'UPDATE requerimientos SET titulo_solicitud = ?, notas = ? WHERE id = ?',
            [titulo, notas, reqId]
          );
          reporte.actualizados += 1;
        } catch (rowErr) {
          reporte.errores.push({
            consecutivo: f.consecutivo,
            filaExcel: f.filaExcel,
            error: rowErr.message,
          });
        }
        continue;
      }

      try {
        const solicitanteId = f.usuario
          ? await asegurarUsuarioInactivo(conn, f.usuario, userCache, reporte)
          : actorUserId;

        const { titulo, notas } = camposTituloNotas(f);
        let notasFinal = notas;
        const createdAt = f.fecha_sol ? `${f.fecha_sol} 12:00:00` : null;

        // Catálogo
        const code = f.codigo_sugerido || extraerCodigoDesdeDescripcion(f.descripcion);
        let cat = code ? catalogo.get(String(code).toUpperCase()) : null;
        let usaLibre = true;
        if (cat) {
          usaLibre = false;
        } else if (code) {
          if (reporte.sinCatalogo.length < 200) {
            reporte.sinCatalogo.push({
              consecutivo: f.consecutivo,
              codigo: code,
              desc: (f.descripcion || '').slice(0, 80),
            });
          }
        }

        const [ins] = await conn.query(
          `INSERT INTO requerimientos
             (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo,
              notas, requiere_cotizacion, estado, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), NOW())`,
          [
            f.consecutivo,
            solicitanteId,
            titulo,
            f.area,
            f.departamento,
            f.tipo,
            notasFinal,
            usaLibre ? 1 : 0,
            f.reqEstado,
            createdAt,
          ]
        );
        const reqId = ins.insertId;
        existMap.set(key, reqId);

        await conn.query(
          `INSERT INTO historial_estados
             (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
           VALUES ('requerimiento', ?, NULL, ?, ?, ?)`,
          [
            reqId,
            f.reqEstado,
            actorUserId,
            `Import Excel${f.estado_excel ? ` · Estado: ${f.estado_excel}` : ''}`,
          ]
        );

        if (!usaLibre && cat) {
          // cantidad: intentar leer del texto "CODE 3 Pzas"
          let cant = 1;
          const codeEsc = String(code).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const mCant = String(f.descripcion || '').match(
            new RegExp(`^${codeEsc}\\s+([\\d.,]+)`, 'i')
          );
          if (mCant) {
            cant = parseFloat(String(mCant[1]).replace(',', '')) || 1;
          }
          await conn.query(
            `INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad)
             VALUES (?, ?, ?)`,
            [reqId, cat.id, cant]
          );
          reporte.itemsCatalogo += 1;
        } else {
          const descItem = (f.descripcion || f.titulo || f.consecutivo).slice(0, 2000);
          await conn.query(
            `INSERT INTO requerimiento_items_libres
               (requerimiento_id, descripcion, cantidad, unidad, notas)
             VALUES (?, ?, 1, NULL, ?)`,
            [
              reqId,
              descItem,
              code && !cat
                ? `No existe en catálogo (código sugerido: ${code})`
                : 'Import histórico — validar catálogo',
            ]
          );
          reporte.itemsLibres += 1;
        }

        if (f.crearOc) {
          const proveedorId = resolverProveedorId(proveedores, f.proveedor);
          const po = f.oc_numero || 'NA';
          const moneda = (f.moneda || 'MXN').slice(0, 3).toUpperCase() || 'MXN';
          const monto = f.total;
          const fechaPo = f.fecha_po || null;
          const fechaAut = f.fecha_po
            ? `${f.fecha_po} 12:00:00`
            : createdAt || null;

          const [ocIns] = await conn.query(
            `INSERT INTO ordenes_compra
               (numero_oc, requerimiento_id, cotizacion_id, proveedor_id, monto_total, moneda,
                autorizado_por, estado, fecha_autorizacion, datatextnow_id, fecha_po, notas, created_at, updated_at)
             VALUES (?, ?, NULL, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?, ?, COALESCE(?, NOW()), NOW())`,
            [
              f.consecutivo, // mismo número que el REQ (incluye A/B/C)
              reqId,
              proveedorId,
              monto,
              moneda,
              actorUserId,
              f.ocEstado || 'generada',
              fechaAut,
              po,
              fechaPo,
              f.status_texto || null,
              createdAt,
            ]
          );
          const ocId = ocIns.insertId;

          await conn.query(
            `UPDATE requerimientos SET orden_compra_id = ?, estado = 'cerrado' WHERE id = ?`,
            [ocId, reqId]
          );

          await conn.query(
            `INSERT INTO historial_estados
               (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
             VALUES ('orden_compra', ?, NULL, ?, ?, ?)`,
            [
              ocId,
              f.ocEstado || 'generada',
              actorUserId,
              `Import Excel · PO ${po}${fechaPo ? ` · fecha ${fechaPo}` : ''}`,
            ]
          );

          reporte.ocsCreadas += 1;
          reporte.porEstadoOc[f.ocEstado || 'generada'] =
            (reporte.porEstadoOc[f.ocEstado || 'generada'] || 0) + 1;
        }

        reporte.importados += 1;
        reporte.porEstadoReq[f.reqEstado] = (reporte.porEstadoReq[f.reqEstado] || 0) + 1;
      } catch (rowErr) {
        reporte.errores.push({
          consecutivo: f.consecutivo,
          filaExcel: f.filaExcel,
          error: rowErr.message,
        });
      }
    }

    await sincronizarConsecutivosConSufijos(conn);
    await conn.commit();

    reporte.ok = true;
    reporte.mensaje =
      `Nuevos: ${reporte.importados} REQ` +
      (reporte.actualizados ? `, actualizados (título/notas): ${reporte.actualizados}` : '') +
      (reporte.ocsCreadas ? `, ${reporte.ocsCreadas} OC` : '') +
      (reporte.duplicados.length ? `. Duplicados en archivo: ${reporte.duplicados.length}` : '') +
      (reporte.usuariosCreados.length ? `. Usuarios inactivos creados: ${reporte.usuariosCreados.length}` : '') +
      (reporte.sinCatalogo.length ? `. Sin catálogo: ${reporte.sinCatalogo.length}` : '') +
      '.';
    return reporte;
  } catch (err) {
    await conn.rollback();
    logger.error('[importarBaseRequerimientos]', err);
    throw err;
  } finally {
    conn.release();
  }
}
