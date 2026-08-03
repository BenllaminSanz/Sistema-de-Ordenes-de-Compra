import { listar as _listar, obtenerPorId, crear as _crear, actualizar as _actualizar, actualizarAreaDepartamento as _actualizarAreaDepartamento, cambiarEstado as _cambiarEstado, eliminar as _eliminar, asignarCatalogoAItemLibre as _asignarCatalogoAItemLibre } from '../models/requerimientos.js';
import * as CotizacionModel from '../models/cotizaciones.js';
import { validarAreaDepartamento } from '../config/departamentosStore.js';
import { validarMismoProveedorCatalogo, calcularRequiereCotizacion } from '../utils/catalogoItems.js';
import { parseExcelRequerimientos, generarExcelRequerimientos } from '../utils/excelRequerimientos.js';
import { importarBaseRequerimientos } from '../utils/importBaseReq.js';
import { notificarComprasReqEnRevision } from '../utils/emailService.js';
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
  compras: {
    // Compras: acusa recibo (recibido), decide y puede regresar/cancelar pre-OC
    borrador: ['en_revision'],
    incompleto: ['en_revision', 'rechazado'],
    en_revision: ['recibido', 'rechazado'],
    recibido: ['aprobado', 'incompleto', 'rechazado', 'en_revision'],
    aprobado: ['cerrado', 'rechazado', 'recibido', 'en_revision'],
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
    const {
      titulo_solicitud, estado, area, departamento, tipo, busqueda,
      orden, ordenar_por, pagina, limite,
    } = req.query;

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
      orden,
      ordenar_por,
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

    // Libres / SERVICIOS / PARTES sin precio de referencia → cotizar
    const requiereCotFinal = await calcularRequiereCotizacion({
      tipo,
      items: tieneItemsEstructurados ? items : [],
      items_libres: tieneItemsLibres ? items_libres : [],
    });

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

    const reqActualPrev = await obtenerPorId(req.params.id);
    if (!reqActualPrev) {
      return res.status(404).json({ mensaje: 'Requerimiento no encontrado' });
    }

    // Recalcular cotización: libres / SERVICIOS / PARTES sin precio
    const itemsParaCot = Array.isArray(items)
      ? items
      : (reqActualPrev.items || []).map((i) => ({ catalogo_id: i.catalogo_id, cantidad: i.cantidad }));
    const libresParaCot = Array.isArray(items_libres)
      ? items_libres
      : (reqActualPrev.items_libres || []);
    const tipoParaCot = tipo || reqActualPrev.tipo;
    const requiereCotFinal = await calcularRequiereCotizacion({
      tipo: tipoParaCot,
      items: itemsParaCot,
      items_libres: libresParaCot,
    });

    if (area !== undefined || departamento !== undefined) {
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
      if (reqActualPrev.solicitante_id !== req.usuario.id) {
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
      const rolLabel = req.usuario.rol === 'compras' ? 'Compras' : req.usuario.rol;
      return res.status(403).json({
        mensaje: `Tu rol (${rolLabel}) no puede cambiar el requerimiento de '${reqActual.estado}' a '${estado}'`,
      });
    }

    // Cancelar o regresar solo si aún no hay OC (con OC el ciclo sigue en la orden)
    const tieneOc = !!(reqActual.orden_compra_id || reqActual.oc_id);
    if (tieneOc && (estado === 'rechazado' || estado === 'en_revision' || estado === 'recibido')) {
      const msg =
        estado === 'rechazado'
          ? 'No se puede cancelar un requerimiento que ya tiene una orden de compra generada. Cancela la OC en su lugar.'
          : estado === 'recibido'
            ? 'No se puede regresar a recibido un requerimiento que ya tiene una orden de compra generada.'
            : 'No se puede regresar a revisión un requerimiento que ya tiene una orden de compra generada.';
      return res.status(422).json({ mensaje: msg });
    }

    // === VALIDACIÓN PARA APROBAR REQUERIMIENTOS QUE NECESITAN COTIZACIÓN ===
    if (estado === 'aprobado') {
      const necesitaCot = await calcularRequiereCotizacion({
        tipo: reqActual.tipo,
        items: (reqActual.items || []).map((i) => ({ catalogo_id: i.catalogo_id })),
        items_libres: reqActual.items_libres || [],
      }) || !!reqActual.requiere_cotizacion;

      if (necesitaCot) {
        const cotizaciones = await CotizacionModel.listarPorRequerimiento(req.params.id);
        const seleccionada = cotizaciones.find(c =>
          c.seleccionada === 1 || c.estado === 'seleccionada'
        );

        if (!seleccionada) {
          return res.status(400).json({
            mensaje: 'Este requerimiento requiere cotización. Debes seleccionar una cotización ganadora antes de aprobar.',
          });
        }
      }
    }

    const estadoAnterior = reqActual.estado;

    await _cambiarEstado(
      req.params.id,
      estado,
      req.usuario.id,
      notas || null
    );

    const actualizado = await obtenerPorId(req.params.id);

    // Aviso a Compras: REQ entró a la bandeja de revisión (no bloquea la respuesta)
    if (
      estado === 'en_revision'
      && estadoAnterior !== 'en_revision'
      && actualizado
    ) {
      notificarComprasReqEnRevision(actualizado, {
        excluirEmail: req.usuario?.email,
      }).catch((err) => {
        logger.warn('[cambiarEstado] Notificación Compras falló:', err?.message || err);
      });
    }

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
    // Proveedor: OC → cotización seleccionada → primer ítem de catálogo del REQ
    // Detalle: título + notas + resumen de ítems (no solo el tipo PARTES/SERVICIOS)
    const [reqs] = await pool.query(`
      SELECT
        r.id, r.consecutivo, r.tipo, r.titulo_solicitud, r.notas,
        r.area, r.departamento, r.estado, r.created_at, r.updated_at,
        u.nombre  AS solicitante_nombre,
        oc.numero_oc             AS oc_numero,
        oc.estado                AS oc_estado,
        COALESCE(oc.monto_total, cot.monto_total) AS oc_monto_total,
        COALESCE(oc.moneda, cot.moneda)           AS oc_moneda,
        oc.datatextnow_id        AS oc_datatextnow_id,
        oc.fecha_po              AS oc_fecha_po,
        oc.fecha_autorizacion    AS oc_fecha_autorizacion,
        COALESCE(p_oc.num_proveedor, p_cot.num_proveedor, p_cat.num_proveedor) AS proveedor_num,
        COALESCE(p_oc.nombre, p_cot.nombre, p_cat.nombre) AS proveedor_nombre,
        (
          SELECT GROUP_CONCAT(
            CONCAT(
              IF(c.codigo IS NOT NULL AND TRIM(c.codigo) <> '', CONCAT(c.codigo, ' — '), ''),
              COALESCE(c.descripcion, ''),
              IF(ri.cantidad IS NOT NULL, CONCAT(' x', ri.cantidad), '')
            )
            ORDER BY ri.id
            SEPARATOR '; '
          )
          FROM requerimiento_items ri
          JOIN catalogo c ON c.id = ri.catalogo_id
          WHERE ri.requerimiento_id = r.id
        ) AS items_resumen,
        (
          SELECT GROUP_CONCAT(
            CONCAT(
              COALESCE(ril.descripcion, ''),
              IF(ril.cantidad IS NOT NULL, CONCAT(' x', ril.cantidad), '')
            )
            ORDER BY ril.id
            SEPARATOR '; '
          )
          FROM requerimiento_items_libres ril
          WHERE ril.requerimiento_id = r.id
        ) AS items_libres_resumen
      FROM requerimientos r
      JOIN usuarios u ON u.id = r.solicitante_id
      LEFT JOIN ordenes_compra oc ON oc.id = r.orden_compra_id
      LEFT JOIN cotizaciones cot ON cot.requerimiento_id = r.id
        AND (cot.seleccionada = 1 OR cot.estado = 'seleccionada')
      LEFT JOIN proveedores p_oc  ON p_oc.id  = oc.proveedor_id
      LEFT JOIN proveedores p_cot ON p_cot.id = cot.proveedor_id
      LEFT JOIN proveedores p_cat ON p_cat.id = (
        SELECT cat.proveedor_id
        FROM requerimiento_items ri2
        JOIN catalogo cat ON cat.id = ri2.catalogo_id
        WHERE ri2.requerimiento_id = r.id
          AND cat.proveedor_id IS NOT NULL
        LIMIT 1
      )
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

/**
 * PATCH /requerimientos/:id/area-departamento
 * Compras/Admin corrigen área y departamento aunque el REQ no sea borrador.
 */
async function actualizarAreaDepartamento(req, res) {
  try {
    let { area, departamento } = req.body || {};
    area = String(area || '').trim().toUpperCase();
    departamento = String(departamento || '').trim().toUpperCase();

    const val = await validarAreaDeptoReq(area, departamento);
    if (!val.ok) {
      return res.status(422).json({ mensaje: val.mensaje });
    }

    const existente = await obtenerPorId(req.params.id);
    if (!existente) {
      return res.status(404).json({ mensaje: 'Requerimiento no encontrado' });
    }

    // Guardar IDs/nombres canónicos del catálogo
    const areaCanon = val.area?.id || area;
    const deptoCanon = val.departamento?.nombre || departamento;

    const afectados = await _actualizarAreaDepartamento(req.params.id, areaCanon, deptoCanon);
    if (!afectados) {
      return res.status(404).json({ mensaje: 'Requerimiento no encontrado' });
    }

    const actualizado = await obtenerPorId(req.params.id);
    res.json(actualizado);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ mensaje: err.mensaje });
    logger.error('[actualizarAreaDepartamento]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export { listar, obtener, crear, actualizar, actualizarAreaDepartamento, cambiarEstado, eliminar, subirReferenciaItem, exportarExcel, importarExcel, asignarCatalogoItemLibre };