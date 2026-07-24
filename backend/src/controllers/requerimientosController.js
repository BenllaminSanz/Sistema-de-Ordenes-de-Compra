import { listar as _listar, obtenerPorId, crear as _crear, actualizar as _actualizar, cambiarEstado as _cambiarEstado, eliminar as _eliminar, asignarCatalogoAItemLibre as _asignarCatalogoAItemLibre } from '../models/requerimientos.js';
import * as CotizacionModel from '../models/cotizaciones.js';
import { validarAreaDepartamento } from '../config/departamentosStore.js';
import { validarMismoProveedorCatalogo } from '../utils/catalogoItems.js';
import { parseExcelRequerimientos, generarExcelRequerimientos } from '../utils/excelRequerimientos.js';
import { importarBaseRequerimientos } from '../utils/importBaseReq.js';
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
    borrador: ['en_revision'],
    incompleto: ['en_revision'],
    en_revision: ['aprobado', 'incompleto', 'rechazado'],
    aprobado: ['cerrado', 'rechazado'],
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

    if (!tieneItemsEstructurados && !tieneItemsLibres) {
      return res.status(400).json({
        mensaje: 'Debe incluir al menos un ítem del catálogo o un ítem nuevo. No se pueden crear requerimientos vacíos.',
      });
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

    const totalItems = (tieneItemsEstructurados ? items.length : 0)
      + (tieneItemsLibres ? items_libres.length : 0);
    if (totalItems > 15) {
      return res.status(422).json({
        mensaje: `Máximo 15 ítems por requerimiento. Tienes ${totalItems}. Crea otro REQ para el resto.`,
      });
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
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
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

    if ((items !== undefined || items_libres !== undefined) && !tieneItemsEstructurados && !tieneItemsLibres) {
      return res.status(400).json({
        mensaje: 'Debe incluir al menos un ítem del catálogo o un ítem nuevo. No se pueden guardar requerimientos vacíos.',
      });
    }

    if (tieneItemsEstructurados) {
      const valProv = await validarMismoProveedorCatalogo(items);
      if (!valProv.ok) {
        return res.status(422).json({ mensaje: valProv.mensaje });
      }
    }

    const totalItemsUpd = (tieneItemsEstructurados ? items.length : 0)
      + (tieneItemsLibres ? items_libres.length : 0);
    if ((items !== undefined || items_libres !== undefined) && totalItemsUpd > 15) {
      return res.status(422).json({
        mensaje: `Máximo 15 ítems por requerimiento. Tienes ${totalItemsUpd}. Crea otro REQ para el resto.`,
      });
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
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
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

    if (estado === 'rechazado' && reqActual.estado === 'aprobado') {
      if (reqActual.orden_compra_id || reqActual.oc_id) {
        return res.status(422).json({
          mensaje: 'No se puede cancelar un requerimiento que ya tiene una orden de compra generada.',
        });
      }
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
    const afectados = await _eliminar(req.params.id, {
      solicitante_id: req.usuario.id,
      rol: req.usuario.rol,
    });

    if (afectados === 0) {
      return res.status(404).json({
        mensaje: 'Requerimiento no encontrado o no se puede eliminar en su estado actual',
      });
    }

    res.status(204).send();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
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
        oc.fecha_po              AS oc_fecha_po,
        oc.fecha_autorizacion    AS oc_fecha_autorizacion,
        p.num_proveedor          AS proveedor_num,
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
    res.setHeader('Content-Disposition', `attachment; filename="BASE_GRAL_REQ_${fecha}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    logger.error('[exportarExcel requerimientos]', err);
    res.status(500).json({ mensaje: 'Error al generar el archivo Excel' });
  }
}

// ─── POST /requerimientos/importar ────────────────────────────────────────────
/**
 * Importa Excel en layout BASE GRAL (PO/Fecha/N°/Estado…) o legacy (hojas SERVICIOS/PARTES).
 * Body multipart: archivo=Excel
 * Query/body opcional:
 *   dry_run=1  → solo valida y resume (no escribe)
 *   wipe=1     → borra REQ/OC/recepciones/cotizaciones antes (solo admin; local/recarga controlada)
 *
 * No crea cotizaciones. Crea OC cuando el Estado Excel lo indica.
 * Sufijos A/B/C en el consecutivo son válidos (varias OC del mismo REQ lógico).
 */
async function importarExcel(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: 'No se recibió ningún archivo Excel' });
    }

    const dryRun =
      req.query.dry_run === '1' ||
      req.query.dry_run === 'true' ||
      req.body?.dry_run === '1' ||
      req.body?.dry_run === true;
    const wipe =
      req.query.wipe === '1' ||
      req.query.wipe === 'true' ||
      req.body?.wipe === '1' ||
      req.body?.wipe === true;

    if (wipe && req.usuario.rol !== 'admin') {
      return res.status(403).json({
        mensaje: 'Solo admin puede importar con wipe (borrado de REQ/OC previos)',
      });
    }

    const parsed = parseExcelRequerimientos(req.file.buffer);
    if (!parsed.filas.length) {
      return res.status(400).json({
        mensaje:
          'El archivo no contiene filas válidas. Use el layout BASE GRAL (Orden de compra, Fecha, N°, …) ' +
          'o las hojas SERVICIOS/PARTES del formato anterior.',
        hojasSaltadas: parsed.hojasSaltadas,
        layout: parsed.layout,
      });
    }

    const reporte = await importarBaseRequerimientos({
      filas: parsed.filas,
      duplicados: parsed.duplicados,
      actorUserId: req.usuario.id,
      wipe: wipe && !dryRun,
      dryRun,
    });

    res.json({
      ...reporte,
      layout: parsed.layout,
      hojasSaltadas: parsed.hojasSaltadas?.length ? parsed.hojasSaltadas : undefined,
    });
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