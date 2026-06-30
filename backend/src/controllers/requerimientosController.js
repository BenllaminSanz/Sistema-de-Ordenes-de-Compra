import { listar as _listar, obtenerPorId, crear as _crear, actualizar as _actualizar, cambiarEstado as _cambiarEstado, eliminar as _eliminar, asignarCatalogoAItemLibre as _asignarCatalogoAItemLibre } from '../models/requerimientos.js';
import * as CotizacionModel from '../models/cotizaciones.js';
import { validarAreaDepartamento } from '../config/departamentosStore.js';
import { validarMismoProveedorCatalogo } from '../utils/catalogoItems.js';
import { parseExcelRequerimientos, generarExcelRequerimientos } from '../utils/excelRequerimientos.js';
import pool from '../config/db.js';
import logger from '../utils/logger.js';

async function validarAreaDeptoReq(area, departamento) {
  if (!area || !departamento) {
    return { ok: false, mensaje: 'Área y departamento son requeridos' };
  }
  return validarAreaDepartamento(area, departamento);
}

/** Transiciones permitidas por rol (admin puede todas las del modelo). */
const TRANSICIONES_POR_ROL = {
  solicitante: {
    borrador: ['en_revision'],
    incompleto: ['en_revision'],
  },
  contabilidad: {
    en_revision: ['aprobado', 'incompleto', 'rechazado'],
    aprobado: ['cerrado'],
  },
};

function puedeCambiarEstadoRequerimiento(rol, estadoActual, estadoNuevo) {
  if (rol === 'admin') return true;
  const permitidas = TRANSICIONES_POR_ROL[rol]?.[estadoActual] || [];
  return permitidas.includes(estadoNuevo);
}

// ─── GET /requerimientos ──────────────────────────────────────────────────────
async function listar(req, res) {
  try {
    const { titulo_solicitud, estado, area, departamento, tipo, busqueda, pagina, limite } = req.query;

    // Los solicitantes solo ven sus propios requerimientos
    const solicitante_id =
      req.usuario.rol === 'solicitante' ? req.usuario.id : req.query.solicitante_id;

    const resultado = await _listar({
      titulo_solicitud,
      estado,
      area,
      departamento,
      tipo,
      busqueda,
      solicitante_id,
      pagina,
      limite,
    });

    res.json(resultado);
  } catch (err) {
    logger.error('[listar requerimientos]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── GET /requerimientos/:id ──────────────────────────────────────────────────
async function obtener(req, res) {
  try {
    const req_ = await obtenerPorId(req.params.id);
    if (!req_) return res.status(404).json({ mensaje: 'Requerimiento no encontrado' });

    // El solicitante solo puede ver el suyo
    if (
      req.usuario.rol === 'solicitante' &&
      req_.solicitante_id !== req.usuario.id
    ) {
      return res.status(403).json({ mensaje: 'Acceso denegado' });
    }

    res.json(req_);
  } catch (err) {
    logger.error('[obtener requerimiento]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── POST /requerimientos ─────────────────────────────────────────────────────
async function crear(req, res) {
  try {
    const { 
      titulo_solicitud, 
      tipo, 
      area, 
      departamento, 
      notas, 
      descripcion,           // compatibilidad con datos antiguos (campo 'descripcion' antes de 'notas')
      requiere_cotizacion,
      items,                 // ítems del catálogo [{catalogo_id, cantidad}]
      items_libres           // ítems en texto libre (aún no en catálogo) [{descripcion, cantidad, unidad?, notas?}]
    } = req.body;

    const notasFinal = (notas || descripcion || '').trim(); // compat datos antiguos

    // Validaciones básicas
    if (!titulo_solicitud || titulo_solicitud.trim().length < 10) {
      return res.status(400).json({ mensaje: 'El titulo debe tener al menos 10 caracteres' });
    }

    // Validación de notas: solo se exige si NO hay items (ni del catálogo ni libres)
    const tieneItemsEstructurados = Array.isArray(items) && items.length > 0;
    const tieneItemsLibres = Array.isArray(items_libres) && items_libres.length > 0;

    if (tieneItemsEstructurados && tieneItemsLibres) {
      return res.status(400).json({ 
        mensaje: 'No se puede mezclar ítems del catálogo con ítems en texto libre en el mismo requerimiento. Un requerimiento debe ser solo de ítems existentes (del catálogo) o solo de ítems nuevos (libres para cotizar y dar de alta).' 
      });
    }

    if (!tieneItemsEstructurados && !tieneItemsLibres && notasFinal.length < 5) {
      return res.status(400).json({ mensaje: 'Las notas deben tener al menos 5 caracteres cuando no se seleccionan ítems del catálogo ni ítems libres' });
    }

    // Forzar requiere_cotizacion=true si hay ítems libres (regla de negocio: solo ellos necesitan cotización para alta en catálogo)
    const requiereCotFinal = tieneItemsLibres ? true : (requiere_cotizacion || false);

    const valAreaDepto = await validarAreaDeptoReq(area, departamento);
    if (!valAreaDepto.ok) {
      return res.status(422).json({ mensaje: valAreaDepto.mensaje });
    }

    if (tieneItemsEstructurados) {
      const valProv = await validarMismoProveedorCatalogo(items);
      if (!valProv.ok) {
        return res.status(422).json({ mensaje: valProv.mensaje });
      }
    }

    const id = await _crear(
      { 
        titulo_solicitud, 
        tipo, 
        area, 
        departamento, 
        notas: notasFinal, 
        requiere_cotizacion: requiereCotFinal,
        items,
        items_libres
      },
      req.usuario.id
    );

    const nuevo = await obtenerPorId(id);
    res.status(201).json(nuevo);
  } catch (err) {
    logger.error('Error al crear requerimiento', {
      error: err.message, 
      stack: err.stack,
      userId: req.usuario?.id 
    });
    res.status(500).json({ mensaje: 'Error interno del servidor', detalle: err.message });
  }
}

// ─── PUT /requerimientos/:id ──────────────────────────────────────────────────
async function actualizar(req, res) {
  try {
    const { 
      titulo_solicitud, 
      area, 
      departamento, 
      tipo, 
      notas, 
      descripcion, 
      requiere_cotizacion, 
      datatextnow_id,
      items,                  // ítems del catálogo para reemplazar
      items_libres            // ítems en texto libre para reemplazar (cuando no están en catálogo)
    } = req.body;

    const tieneItemsEstructurados = Array.isArray(items) && items.length > 0;
    const tieneItemsLibres = Array.isArray(items_libres) && items_libres.length > 0;

    if (tieneItemsEstructurados && tieneItemsLibres) {
      return res.status(400).json({ 
        mensaje: 'No se puede mezclar ítems del catálogo con ítems en texto libre en el mismo requerimiento. Un requerimiento debe ser solo de ítems existentes (del catálogo) o solo de ítems nuevos (libres para cotizar y dar de alta).' 
      });
    }

    if (tieneItemsEstructurados) {
      const valProv = await validarMismoProveedorCatalogo(items);
      if (!valProv.ok) {
        return res.status(422).json({ mensaje: valProv.mensaje });
      }
    }

    // Forzar requiere_cotizacion=true cuando se usan items_libres (libres siempre requieren cotización)
    const requiereCotFinal = tieneItemsLibres ? true : (requiere_cotizacion || false);

    const reqActualPrev = (area !== undefined || departamento !== undefined || req.usuario.rol === 'solicitante')
      ? await obtenerPorId(req.params.id)
      : null;

    if (area !== undefined || departamento !== undefined) {
      if (!reqActualPrev) {
        return res.status(404).json({ mensaje: 'Requerimiento no encontrado' });
      }
      const valAreaDepto = await validarAreaDeptoReq(
        area ?? reqActualPrev.area,
        departamento ?? reqActualPrev.departamento
      );
      if (!valAreaDepto.ok) {
        return res.status(422).json({ mensaje: valAreaDepto.mensaje });
      }
    }

    // Los solicitantes solo pueden editar sus propios requerimientos
    if (req.usuario.rol === 'solicitante') {
      const reqActual = reqActualPrev || await obtenerPorId(req.params.id);
      if (!reqActual) {
        return res.status(404).json({ mensaje: 'Requerimiento no encontrado' });
      }
      if (reqActual.solicitante_id !== req.usuario.id) {
        return res.status(403).json({ mensaje: 'No puedes editar requerimientos de otros usuarios' });
      }
    }

    const afectados = await _actualizar(req.params.id, {
      titulo_solicitud: titulo_solicitud?.trim(),
      area,
      departamento,
      tipo,
      notas: (notas || descripcion)?.trim(), // compat datos antiguos
      requiere_cotizacion: requiereCotFinal,
      datatextnow_id,
    }, items, items_libres);

    if (afectados === 0) {
      return res.status(404).json({
        mensaje: 'Requerimiento no encontrado o su estado no permite edición',
      });
    }

    const actualizado = await obtenerPorId(req.params.id);
    res.json(actualizado);
  } catch (err) {
    logger.error('[actualizar requerimiento]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── PATCH /requerimientos/:id/estado ────────────────────────────────────────
async function cambiarEstado(req, res) {
  try {
    // Zod ya comprobo que 'estado' existe y es válido
    const { estado, notas } = req.body;

    const reqActual = await obtenerPorId(req.params.id);
    if (!reqActual) {
      return res.status(404).json({ mensaje: 'Requerimiento no encontrado' });
    }

    // Verificar ownership para solicitantes
    if (req.usuario.rol === 'solicitante' && reqActual.solicitante_id !== req.usuario.id) {
      return res.status(403).json({ mensaje: 'No puedes cambiar el estado de requerimientos de otros usuarios' });
    }

    if (!puedeCambiarEstadoRequerimiento(req.usuario.rol, reqActual.estado, estado)) {
      const rolLabel = req.usuario.rol === 'contabilidad' ? 'contabilidad' : req.usuario.rol;
      return res.status(403).json({
        mensaje: `Tu rol (${rolLabel}) no puede cambiar el requerimiento de '${reqActual.estado}' a '${estado}'`,
      });
    }

    // === VALIDACIÓN PARA APROBAR REQUERIMIENTOS QUE NECESITAN COTIZACIÓN ===
    if (estado === 'aprobado') {
      if (reqActual.requiere_cotizacion) {
        const cotizaciones = await CotizacionModel.listarPorRequerimiento(req.params.id);
        const seleccionada = cotizaciones.find(c => 
          c.seleccionada === 1 || c.estado === 'seleccionada'
        );

        if (!seleccionada) {
          return res.status(400).json({ 
            mensaje: 'Este requerimiento requiere cotización. Debes seleccionar una cotización ganadora antes de aprobar.' 
          });
        }

        if (!seleccionada.archivo_url || !seleccionada.archivo_url.trim()) {
          return res.status(400).json({ 
            mensaje: 'Debes adjuntar el PDF de la cotización seleccionada antes de aprobar el requerimiento.' 
          });
        }
      }
    }

    await _cambiarEstado(
      req.params.id,
      estado,
      req.usuario.id,
      notas || null
    );

    const actualizado = await obtenerPorId(req.params.id);
    res.json(actualizado);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
    
    logger.error('Error al cambiar estado de requerimiento', { 
      error: err.message, 
      stack: err.stack,
      requerimientoId: req.params.id,
      userId: req.usuario?.id 
    });
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── DELETE /requerimientos/:id ───────────────────────────────────────────────
async function eliminar(req, res) {
  try {
    const afectados = await _eliminar(req.params.id);

    if (afectados === 0) {
      return res.status(404).json({
        mensaje: 'Requerimiento no encontrado o no se puede eliminar en su estado actual',
      });
    }

    res.status(204).send();
  } catch (err) {
    logger.error('Error al eliminar requerimiento', { 
      error: err.message, 
      stack: err.stack,
      requerimientoId: req.params.id,
      userId: req.usuario?.id 
    });
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function subirReferenciaItem(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: 'No se recibió ningún archivo de referencia' });
    }

    res.status(201).json({
      referencia_tipo: 'archivo',
      referencia_url: `/uploads/items-referencia/${req.file.filename}`,
      referencia_nombre: req.file.originalname,
    });
  } catch (err) {
    logger.error('[subirReferenciaItem]', err);
    res.status(500).json({ mensaje: 'Error al subir el archivo de referencia' });
  }
}

// ─── GET /requerimientos/exportar ────────────────────────────────────────────
async function exportarExcel(req, res) {
  try {
    const [reqs] = await pool.query(`
      SELECT
        r.id, r.consecutivo, r.tipo, r.titulo_solicitud, r.notas,
        r.area, r.departamento, r.estado, r.created_at, r.updated_at,
        u.nombre  AS solicitante_nombre,
        oc.numero_oc             AS oc_numero,
        oc.estado                AS oc_estado,
        oc.monto_total           AS oc_monto_total,
        oc.moneda                AS oc_moneda,
        oc.datatextnow_id        AS oc_datatextnow_id,
        oc.fecha_autorizacion    AS oc_fecha_autorizacion,
        p.nombre                 AS proveedor_nombre
      FROM requerimientos r
      JOIN usuarios u ON u.id = r.solicitante_id
      LEFT JOIN ordenes_compra oc ON oc.id = r.orden_compra_id
      LEFT JOIN proveedores p    ON p.id  = oc.proveedor_id
      ORDER BY r.tipo ASC, r.created_at ASC
    `);

    const buffer = generarExcelRequerimientos(reqs);

    const fecha  = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Requerimientos-${fecha}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    logger.error('[exportarExcel requerimientos]', err);
    res.status(500).json({ mensaje: 'Error al generar el archivo Excel' });
  }
}

// ─── POST /requerimientos/importar ────────────────────────────────────────────
async function importarExcel(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: 'No se recibió ningún archivo Excel' });
    }

    const { filas, hojasSaltadas } = parseExcelRequerimientos(req.file.buffer);
    if (!filas.length) {
      return res.status(400).json({ mensaje: 'El archivo no contiene filas válidas en las hojas SERVICIOS o PARTES' });
    }

    // Cargar catálogo de usuarios para matching por nombre
    const [dbUsers] = await pool.query('SELECT id, nombre FROM usuarios');
    const byFull    = new Map(dbUsers.map(u => [u.nombre.toLowerCase().trim(), u.id]));
    const adminId   = dbUsers.find(u => u.id === req.usuario.id)?.id
                   || dbUsers.find(u => /* any admin */true)?.id;

    function matchUsuario(excelNombre) {
      if (!excelNombre) return null;
      const lower = excelNombre.toLowerCase().trim();
      if (byFull.has(lower)) return byFull.get(lower);
      const tokens = lower.split(/\s+/);
      if (tokens.length > 2) {
        const dos = tokens.slice(0, 2).join(' ');
        if (byFull.has(dos)) return byFull.get(dos);
        for (const [k, v] of byFull.entries()) {
          if (lower.includes(k.split(' ')[0]) && lower.includes((k.split(' ')[1] || ''))) return v;
          if (k.includes(tokens[0]) && (tokens[1] ? k.includes(tokens[1]) : true)) return v;
        }
      }
      return null;
    }

    // Cargar consecutivos existentes para deduplicar
    const [existentes] = await pool.query('SELECT consecutivo FROM requerimientos');
    const existenteSet  = new Set(existentes.map(r => r.consecutivo));

    const nuevas = filas.filter(f =>
      !existenteSet.has(f.consecutivo) && !existenteSet.has('REQ-' + f.consecutivo)
    );

    if (!nuevas.length) {
      return res.json({
        importados:    0,
        saltados:      filas.length,
        hojasSaltadas,
        mensaje:       'Todos los registros del archivo ya existen en el sistema',
      });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let importados = 0;
      const errores  = [];

      for (const f of nuevas) {
        const solicitanteId = matchUsuario(f.usuario) ?? req.usuario.id;
        const titulo        = (f.titulo || f.consecutivo).slice(0, 500);
        const notas         = (f.notas || '').slice(0, 2000);
        const createdAt     = f.fecha_sol ? `${f.fecha_sol} 00:00:00` : null;

        try {
          await conn.query(`
            INSERT INTO requerimientos
              (consecutivo, solicitante_id, titulo_solicitud, tipo, area,
               notas, requiere_cotizacion, estado, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NOW())
          `, [
            f.consecutivo,
            solicitanteId,
            titulo,
            f.tipo,
            f.area,
            notas,
            f.estado,
            createdAt,
          ]);
          importados++;
        } catch (rowErr) {
          errores.push(`${f.consecutivo}: ${rowErr.message}`);
        }
      }

      await conn.commit();

      res.json({
        importados,
        saltados:      filas.length - nuevas.length,
        errores:       errores.length ? errores : undefined,
        hojasSaltadas: hojasSaltadas.length ? hojasSaltadas : undefined,
        mensaje:       `Se importaron ${importados} requerimiento(s) nuevos.` +
                       (errores.length ? ` ${errores.length} con error.` : ''),
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    logger.error('[importarExcel requerimientos]', err);
    res.status(500).json({ mensaje: 'Error al procesar el archivo: ' + err.message });
  }
}

// ─── PATCH /requerimientos/:id/items-libres/:libreId/catalogo ─────────────────
async function asignarCatalogoItemLibre(req, res) {
  try {
    const { id, libreId } = req.params;
    const { catalogo_id } = req.body;

    await _asignarCatalogoAItemLibre(id, libreId, catalogo_id ?? null);

    const actualizado = await obtenerPorId(id);
    res.json(actualizado);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
    logger.error('[asignarCatalogoItemLibre]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export { listar, obtener, crear, actualizar, cambiarEstado, eliminar, subirReferenciaItem, exportarExcel, importarExcel, asignarCatalogoItemLibre };