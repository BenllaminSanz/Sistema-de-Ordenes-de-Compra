import XLSX from 'xlsx';
import { normalizarNumProveedor, obtenerPorNumProveedor } from '../models/proveedores.js';
import * as CatalogoModel from '../models/catalogo.js';
import logger from '../utils/logger.js';

async function listar(req, res) {
  try {
    const filtros = {
      tipo: req.query.tipo || null,
      busqueda: req.query.busqueda || null,
      proveedor_id: req.query.proveedor_id ? parseInt(req.query.proveedor_id, 10) : null,
      soloActivos: req.query.soloActivos === 'true'
    };

    const items = await CatalogoModel.listar(filtros);
    res.json(items);
  } catch (err) {
    logger.error('[listar catalogo]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function obtener(req, res) {
  try {
    const item = await CatalogoModel.obtenerPorId(req.params.id);
    if (!item) return res.status(404).json({ mensaje: 'Elemento no encontrado en el catálogo' });
    res.json(item);
  } catch (err) {
    logger.error('[obtener catalogo]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function crear(req, res) {
  try {
    const { tipo, codigo, descripcion, unidad, costo_referencia, moneda, proveedor_id } = req.body;

    if (!tipo || !codigo || !descripcion) {
      return res.status(400).json({ mensaje: 'Tipo, código y descripción son obligatorios' });
    }

    if (moneda && !['MXN', 'USD'].includes(moneda)) {
      return res.status(400).json({ mensaje: 'Moneda inválida. Use MXN o USD' });
    }

    const id = await CatalogoModel.crear({
      tipo,
      codigo,
      descripcion,
      unidad: unidad || null,
      costo_referencia,
      moneda,
      proveedor_id
    });

    res.status(201).json(await CatalogoModel.obtenerPorId(id));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe un elemento con ese código en el catálogo' });
    }
    logger.error('[crear catalogo]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function actualizar(req, res) {
  try {
    if (req.body.moneda && !['MXN', 'USD'].includes(req.body.moneda)) {
      return res.status(400).json({ mensaje: 'Moneda inválida. Use MXN o USD' });
    }

    const afectados = await CatalogoModel.actualizar(req.params.id, req.body);
    if (!afectados) return res.status(404).json({ mensaje: 'Elemento no encontrado en el catálogo' });

    res.json(await CatalogoModel.obtenerPorId(req.params.id));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe un elemento con ese código' });
    }
    logger.error('[actualizar catalogo]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function cambiarEstado(req, res) {
  try {
    const { activo } = req.body;
    if (activo === undefined) {
      return res.status(400).json({ mensaje: "El campo 'activo' es requerido" });
    }

    const afectados = await CatalogoModel.cambiarEstado(req.params.id, activo);
    if (!afectados) return res.status(404).json({ mensaje: 'Elemento no encontrado en el catálogo' });

    res.json({ 
      mensaje: `Elemento ${activo ? 'activado' : 'desactivado'} correctamente` 
    });
  } catch (err) {
    logger.error('[cambiarEstado catalogo]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

/**
 * Columnas del Excel de catálogo (ida/vuelta):
 * 0: No de proveedor
 * 1: Proveedor (nombre; solo referencia / export)
 * 2: Numero de Parte → codigo
 * 3: Descripción
 * 4: UOM → unidad
 * 5: Costo unitario → costo_referencia
 * 6: Moneda
 * 7+: columnas extra del Excel externo → en export se dejan en blanco si no existen en sistema
 *
 * Upsert por código de ítem: si existe, actualiza campos; si no, inserta.
 * Tipo se fuerza a 'PARTES' en import (archivo de catálogo de partes).
 */
const EXCEL_HEADERS = [
  'No de proveedor',
  'Proveedor',
  'Numero de Parte',
  'Descripción',
  'UOM',
  'Costo unitario',
  'Moneda',
];

async function importarExcel(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: 'Archivo Excel requerido (campo "excel")' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rows.length) {
      return res.status(400).json({ mensaje: 'El archivo Excel está vacío' });
    }

    let nuevos = 0;
    let actualizados = 0;
    let omitidos = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row)) {
        omitidos++;
        continue;
      }

      // Saltar encabezado
      if (i === 0 && typeof row[0] === 'string' && /proveedor|no de|numero de parte/i.test(String(row[0]))) {
        continue;
      }

      const rawNumProv = row[0];
      const numeroParte = row[2] != null && row[2] !== '' ? String(row[2]).trim() : '';
      const descripcion = row[3] != null && row[3] !== '' ? String(row[3]).trim() : '';
      const uom = row[4] != null && row[4] !== '' ? String(row[4]).trim() : '';
      const costo = row[5] != null && row[5] !== '' ? parseFloat(row[5]) : null;
      const moneda = row[6] != null && row[6] !== '' ? String(row[6]).trim().toUpperCase() : 'MXN';

      if (!numeroParte || !descripcion) {
        omitidos++;
        continue;
      }

      const prov = await obtenerPorNumProveedor(rawNumProv);
      const proveedor_id = prov ? prov.id : null;
      const payload = {
        tipo: 'PARTES',
        codigo: numeroParte,
        descripcion,
        unidad: uom || null,
        costo_referencia: costo != null && !isNaN(costo) ? costo : null,
        moneda: ['MXN', 'USD'].includes(moneda) ? moneda : 'MXN',
        proveedor_id,
        activo: 1,
      };

      try {
        const existente = await CatalogoModel.obtenerPorCodigo(numeroParte);
        if (existente) {
          await CatalogoModel.actualizar(existente.id, {
            tipo: payload.tipo,
            codigo: payload.codigo,
            descripcion: payload.descripcion,
            unidad: payload.unidad,
            costo_referencia: payload.costo_referencia,
            moneda: payload.moneda,
            proveedor_id: payload.proveedor_id,
          });
          // Reactivar si estaba desactivado (actualización de catálogo)
          if (!existente.activo) {
            await CatalogoModel.cambiarEstado(existente.id, true);
          }
          actualizados++;
        } else {
          await CatalogoModel.crear(payload);
          nuevos++;
        }
      } catch (insErr) {
        if (insErr.code === 'ER_DUP_ENTRY') {
          omitidos++;
        } else {
          throw insErr;
        }
      }
    }

    res.json({
      mensaje: `Carga correcta. Nuevos: ${nuevos}, actualizados: ${actualizados}, omitidos: ${omitidos}.`,
      nuevos,
      actualizados,
      omitidos,
      total_filas: rows.length,
    });
  } catch (err) {
    logger.error('[importarExcel catalogo]', err);
    if (err.message && err.message.includes('Solo archivos Excel')) {
      return res.status(400).json({ mensaje: err.message });
    }
    res.status(500).json({ mensaje: 'Error al procesar el archivo Excel' });
  }
}

/**
 * Exporta el catálogo con el mismo formato de carga.
 * Columnas del sistema se llenan; columnas extra no existen en sistema → en blanco.
 */
async function exportarExcel(req, res) {
  try {
    const items = await CatalogoModel.listar({
      tipo: req.query.tipo || null,
      busqueda: req.query.busqueda || null,
      proveedor_id: req.query.proveedor_id ? parseInt(req.query.proveedor_id, 10) : null,
      soloActivos: req.query.soloActivos === 'true',
    });

    const data = [
      [...EXCEL_HEADERS],
      ...items.map((it) => [
        it.proveedor_num || '',
        it.proveedor_nombre || '',
        it.codigo || '',
        it.descripcion || '',
        it.unidad || '',
        it.costo_referencia != null ? Number(it.costo_referencia) : '',
        it.moneda || 'MXN',
      ]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Catalogo');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="catalogo_${fecha}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    logger.error('[exportarExcel catalogo]', err);
    res.status(500).json({ mensaje: 'Error al exportar el catálogo' });
  }
}

async function eliminar(req, res) {
  try {
    const result = await CatalogoModel.eliminarDesactivado(req.params.id);
    if (!result.ok) {
      return res.status(result.status || 400).json({ mensaje: result.mensaje });
    }
    res.json({ mensaje: result.mensaje });
  } catch (err) {
    logger.error('[eliminar catalogo]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export {
  listar,
  obtener,
  crear,
  actualizar,
  cambiarEstado,
  eliminar,
  importarExcel,
  exportarExcel,
};
