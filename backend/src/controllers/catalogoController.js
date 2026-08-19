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
      proveedor_nombre: req.query.proveedor_nombre || null,
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

    if (moneda && !['MXN', 'USD', 'EUR'].includes(moneda)) {
      return res.status(400).json({ mensaje: 'Moneda inválida. Use MXN, USD o EUR' });
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
    if (req.body.moneda && !['MXN', 'USD', 'EUR'].includes(req.body.moneda)) {
      return res.status(400).json({ mensaje: 'Moneda inválida. Use MXN, USD o EUR' });
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

/** Normaliza encabezado de columna Excel para comparación. */
function normHeader(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Mapea columnas por nombre de encabezado.
 * Layout Contabilidad (default sin encabezado): A=num prov, B=nombre, C=código, D=desc, E=UOM, F=costo, G=moneda.
 * Layout proveedor (p.ej. 157 AMERICAN SUESSEN):
 *   VENDOR_NUMBER | VEN_ITEM (PART NUMBER) | DESCRIPTION | STOCK_UOM | CURRENCY | BASE_COST | …
 */
function resolverMapaColumnasCatalogo(headerRow) {
  // Índices fijos Excel: A=0 … G=6  →  Código siempre en C (índice 2)
  const fallback = {
    numProv: 0,
    nombreProv: 1,
    codigo: 2,
    descripcion: 3,
    uom: 4,
    costo: 5,
    moneda: 6,
  };
  if (!headerRow || !Array.isArray(headerRow)) return { map: fallback, esHeader: false };

  const cells = headerRow.map(normHeader);
  const esHeader = cells.some((c) =>
    /proveedor|vendor|numero de parte|no\.?\s*de\s*parte|part\s*number|ven_?item|codigo|descripcion|description|uom|unidad|stock_?uom|costo|base_?cost|moneda|currency/.test(c)
  );
  if (!esHeader) return { map: fallback, esHeader: false };

  const findIdx = (...patterns) => {
    for (let i = 0; i < cells.length; i++) {
      for (const p of patterns) {
        if (p.test(cells[i])) return i;
      }
    }
    return -1;
  };

  // Código / Nº de parte: priorizar "numero de parte", "ven_item", "part number", "codigo"
  // NO "descripcion" ni "replacing_item"
  let codigo = findIdx(
    /^ven_?item(\s*\(.*\))?$/,
    /part\s*number/,
    /^numero de parte$/,
    /^n[oº°.]?\s*de\s*parte$/,
    /^codigo(\s*de\s*item)?$/,
    /^sku$/
  );
  // Si no hay match por nombre, forzar columna C (índice 2) — layout Contabilidad
  if (codigo < 0) codigo = 2;

  let descripcion = findIdx(/^descripcion$/, /^description$/, /^concepto$/);
  if (descripcion < 0) descripcion = 3;
  // Evitar que descripción y código apunten a la misma columna
  if (descripcion === codigo) {
    descripcion = codigo === 3 ? 2 : 3;
  }

  let numProv = findIdx(
    /^vendor_?number$/,
    /^no\.?\s*de\s*proveedor$/,
    /^num(ero)?\s*proveedor$/,
    /^vendor$/,
    /^vendor_?no/
  );
  if (numProv < 0) numProv = 0;

  let nombreProv = findIdx(/^proveedor$/, /^nombre\s*proveedor$/, /^supplier$/, /^vendor_?name$/);
  // En layout SUESSEN no hay nombre de proveedor; -1 → se ignora
  if (nombreProv < 0) {
    // Solo default a col B si no parece layout de part-number en B
    nombreProv = (codigo === 1) ? -1 : 1;
  }

  let uom = findIdx(/^stock_?uom$/, /^uom$/, /^unidad(es)?$/, /^udm$/);
  if (uom < 0) uom = 4;

  let costo = findIdx(/^base_?cost$/, /^costo/, /^precio/, /^cost\s*unit/, /^unit\s*cost/);
  if (costo < 0) costo = 5;

  let moneda = findIdx(/^moneda$/, /^currency$/, /^curr$/);
  if (moneda < 0) moneda = 6;

  return {
    map: { numProv, nombreProv, codigo, descripcion, uom, costo, moneda },
    esHeader: true,
  };
}

/** Parsea costos tipo "$116.10", "1,234.56", "116.10 USD" */
function parseCostoCatalogo(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  let s = String(raw).trim();
  if (!s) return null;
  // Quitar moneda y símbolos
  s = s.replace(/[$€£\s]/g, '').replace(/[A-Za-z]/g, '');
  // Si usa coma decimal europea (116,10) y no hay punto
  if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function celda(row, idx) {
  if (idx == null || idx < 0 || !row) return '';
  const v = row[idx];
  if (v == null || v === '') return '';
  return String(v).trim();
}

async function importarExcel(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: 'Archivo Excel requerido (campo "excel")' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // raw:false ayuda a leer textos; defval vacío evita undefined
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

    if (!rows.length) {
      return res.status(400).json({ mensaje: 'El archivo Excel está vacío' });
    }

    const { map, esHeader } = resolverMapaColumnasCatalogo(rows[0]);
    const startIdx = esHeader ? 1 : 0;

    let nuevos = 0;
    let actualizados = 0;
    let omitidos = 0;

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row)) {
        omitidos++;
        continue;
      }

      // Saltar filas de encabezado residuales
      const c0 = celda(row, map.numProv);
      const cCod = celda(row, map.codigo);
      if (/proveedor|numero de parte|descripcion/i.test(c0) || /numero de parte|^codigo$/i.test(cCod)) {
        continue;
      }

      const rawNumProv = celda(row, map.numProv);
      // Código de ítem = columna mapeada (C en Contabilidad; VEN_ITEM en layout proveedor)
      const numeroParte = celda(row, map.codigo);
      const descripcion = celda(row, map.descripcion);
      const uom = celda(row, map.uom);
      const costo = parseCostoCatalogo(celda(row, map.costo));
      let moneda = celda(row, map.moneda).toUpperCase().replace(/[^A-Z]/g, '') || 'MXN';
      if (moneda.length > 3) moneda = moneda.slice(0, 3);

      if (!numeroParte || !descripcion) {
        omitidos++;
        continue;
      }
      // Evitar cargar descripción como código (filas mal alineadas)
      if (numeroParte.length > 80 && descripcion && numeroParte === descripcion) {
        omitidos++;
        continue;
      }
      // Saltar filas de "replacing" u otros no-código (muy largas sin dígitos útiles)
      if (/^replacing/i.test(numeroParte)) {
        omitidos++;
        continue;
      }

      const prov = rawNumProv ? await obtenerPorNumProveedor(rawNumProv) : null;
      const proveedor_id = prov ? prov.id : null;
      const payload = {
        tipo: 'PARTES',
        codigo: numeroParte,
        descripcion,
        unidad: uom || null,
        costo_referencia: costo,
        moneda: ['MXN', 'USD', 'EUR'].includes(moneda) ? moneda : 'MXN',
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
    const pid = req.query.proveedor_id ? parseInt(req.query.proveedor_id, 10) : null;
    const items = await CatalogoModel.listar({
      tipo: req.query.tipo || null,
      busqueda: req.query.busqueda || null,
      proveedor_id: Number.isInteger(pid) ? pid : null,
      proveedor_nombre: req.query.proveedor_nombre || null,
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
    const sufijos = [];
    if (req.query.proveedor_id) sufijos.push(`prov${req.query.proveedor_id}`);
    if (req.query.tipo) sufijos.push(String(req.query.tipo).toLowerCase());
    const nombre = sufijos.length
      ? `catalogo_${fecha}_${sufijos.join('_')}.xlsx`
      : `catalogo_${fecha}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
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
