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
 * Importa elementos al catálogo desde Excel.
 * Columnas esperadas (en orden):
 * 0: No de proveedor (num_proveedor)
 * 1: Proveedor (nombre, se usa solo para referencia)
 * 2: Numero de Parte → codigo
 * 3: Descripción
 * 4: UOM → unidad
 * 5: Costo unitario → costo_referencia
 * 6: Moneda
 *
 * Si el codigo ya existe → se omite.
 * Se resuelve el proveedor_id a partir del num_proveedor (normalizado).
 * Tipo se fuerza a 'PARTES' (el archivo es CATALOGO PARTES).
 */
async function importarExcel(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: 'Archivo Excel requerido (campo "excel")' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (!rows.length) {
      return res.status(400).json({ mensaje: 'El archivo Excel está vacío' });
    }

    let nuevos = 0;
    let omitidos = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 5) {
        omitidos++;
        continue;
      }

      // Saltar encabezado
      if (i === 0 && typeof row[0] === 'string' && /proveedor|no de/i.test(row[0])) {
        continue;
      }

      const rawNumProv = row[0];
      const numeroParte = row[2] ? String(row[2]).trim() : '';
      const descripcion = row[3] ? String(row[3]).trim() : '';
      const uom = row[4] ? String(row[4]).trim() : '';
      const costo = row[5] != null ? parseFloat(row[5]) : null;
      const moneda = row[6] ? String(row[6]).trim().toUpperCase() : 'MXN';

      if (!numeroParte || !descripcion) {
        omitidos++;
        continue;
      }

      // Buscar proveedor por num_proveedor
      const prov = await obtenerPorNumProveedor(rawNumProv);
      const proveedor_id = prov ? prov.id : null;

      // Verificar si el código ya existe
      const existentes = await CatalogoModel.listar({ busqueda: numeroParte });
      const yaExiste = existentes.some(item => item.codigo === numeroParte);
      if (yaExiste) {
        omitidos++;
        continue;
      }

      // Insertar como PARTES (el archivo es de partes)
      try {
        await CatalogoModel.crear({
          tipo: 'PARTES',
          codigo: numeroParte,
          descripcion,
          unidad: uom || null,
          costo_referencia: isNaN(costo) ? null : costo,
          moneda: ['MXN', 'USD'].includes(moneda) ? moneda : 'MXN',
          proveedor_id,
          activo: 1
        });
        nuevos++;
      } catch (insErr) {
        if (insErr.code === 'ER_DUP_ENTRY') {
          omitidos++;
        } else {
          throw insErr;
        }
      }
    }

    res.json({
      mensaje: `Carga correcta. Se importaron ${nuevos} elementos nuevos al catálogo.`,
      nuevos,
      omitidos,
      total_filas: rows.length
    });
  } catch (err) {
    logger.error('[importarExcel catalogo]', err);
    if (err.message && err.message.includes('Solo archivos Excel')) {
      return res.status(400).json({ mensaje: err.message });
    }
    res.status(500).json({ mensaje: 'Error al procesar el archivo Excel' });
  }
}

export { listar, obtener, crear, actualizar, cambiarEstado, importarExcel };
