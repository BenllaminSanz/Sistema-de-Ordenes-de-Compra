import {
  listar as _listar,
  obtenerPorId,
  crear as _crear,
  actualizar as _actualizar,
  cambiarEstado as _cambiarEstado,
  normalizarNumProveedor
} from '../models/proveedores.js';
import logger from '../utils/logger.js';
import XLSX from 'xlsx';
import pool from '../config/db.js';

function validarNumProveedor(valor, requerido = false) {
  if (valor == null || valor === '') {
    return requerido ? 'El número de proveedor es obligatorio' : null;
  }
  const normalizado = normalizarNumProveedor(valor);
  if (!/^\d{5}$/.test(normalizado)) {
    return 'El número de proveedor debe tener exactamente 5 dígitos';
  }
  return null;
}

async function listar(req, res) {
  try {
    const soloActivos = req.query.activos === 'true';
    res.json(await _listar(soloActivos));
  } catch (err) {
    logger.error('[listar proveedores]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function obtener(req, res) {
  try {
    const p = await obtenerPorId(req.params.id);
    if (!p) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json(p);
  } catch (err) {
    logger.error('[obtener proveedor]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

function normalizarEmail(valor) {
  if (valor == null) return null;
  const email = String(valor).trim().toLowerCase();
  return email || null;
}

async function crear(req, res) {
  try {
    const { num_proveedor, nombre, telefono, rfc, notas } = req.body;
    const email = normalizarEmail(req.body.email);
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ mensaje: 'El nombre es requerido' });
    }

    const errorNum = validarNumProveedor(num_proveedor, true);
    if (errorNum) return res.status(400).json({ mensaje: errorNum });

    const id = await _crear({ num_proveedor, nombre: String(nombre).trim(), email, telefono, rfc, notas });
    res.status(201).json(await obtenerPorId(id));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const campo = String(err.message || '').includes('num_proveedor')
        ? 'número de proveedor'
        : String(err.message || '').toLowerCase().includes('email')
          ? 'email'
          : 'RFC';
      return res.status(409).json({ mensaje: `Ya existe un proveedor con ese ${campo}` });
    }
    logger.error('[crear proveedor]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function actualizar(req, res) {
  try {
    if (req.body.num_proveedor !== undefined) {
      const errorNum = validarNumProveedor(req.body.num_proveedor, true);
      if (errorNum) return res.status(400).json({ mensaje: errorNum });
    }

    const datos = { ...req.body };
    if (datos.email !== undefined) {
      datos.email = normalizarEmail(datos.email);
    }
    if (datos.nombre !== undefined) {
      if (!datos.nombre || !String(datos.nombre).trim()) {
        return res.status(400).json({ mensaje: 'El nombre es requerido' });
      }
      datos.nombre = String(datos.nombre).trim();
    }

    const afectados = await _actualizar(req.params.id, datos);
    if (!afectados) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json(await obtenerPorId(req.params.id));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const campo = String(err.message || '').includes('num_proveedor')
        ? 'número de proveedor'
        : String(err.message || '').toLowerCase().includes('email')
          ? 'email'
          : 'RFC';
      return res.status(409).json({ mensaje: `Ya existe un proveedor con ese ${campo}` });
    }
    logger.error('[actualizar proveedor]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

async function cambiarEstado(req, res) {
  try {
    const { activo } = req.body;
    if (activo === undefined) {
      return res.status(400).json({ mensaje: "El campo 'activo' es requerido" });
    }
    const afectados = await _cambiarEstado(req.params.id, activo);
    if (!afectados) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json({ mensaje: `Proveedor ${activo ? 'activado' : 'desactivado'}` });
  } catch (err) {
    logger.error('[cambiarEstado proveedor]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

/**
 * Importa proveedores desde Excel.
 * Columnas esperadas (primeras 3): id/num_proveedor, nombre, correo/email (email opcional)
 * Si el num_proveedor ya existe, se omite.
 */
async function importarExcel(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: 'Archivo Excel requerido (campo "excel")' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // array of arrays

    if (!rows.length) {
      return res.status(400).json({ mensaje: 'El archivo Excel está vacío' });
    }

    // Precargar números existentes para chequeo rápido
    const [existentesRows] = await pool.query('SELECT num_proveedor FROM proveedores');
    const existentes = new Set(
      existentesRows
        .map(r => normalizarNumProveedor(r.num_proveedor))
        .filter(Boolean)
    );

    let nuevos = 0;
    let omitidos = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 3) {
        omitidos++;
        continue;
      }

      const rawId = row[0];
      const nombre = row[1] ? String(row[1]).trim() : '';
      const email = row[2] ? String(row[2]).trim().toLowerCase() : '';

      // Saltar fila de encabezado (primera fila suele tener texto)
      if (i === 0 && (typeof rawId === 'string' && /proveedor|id|n°|num/i.test(rawId))) {
        continue;
      }

      const num_proveedor = normalizarNumProveedor(rawId);

      if (!num_proveedor || !/^\d{5}$/.test(num_proveedor)) {
        omitidos++;
        continue;
      }
      // Nombre obligatorio; email opcional (p. ej. tiendas / compra directa)
      if (!nombre) {
        omitidos++;
        continue;
      }

      if (existentes.has(num_proveedor)) {
        omitidos++;
        continue;
      }

      // Insertar básico (solo lo mínimo requerido)
      try {
        await pool.query(
          'INSERT INTO proveedores (num_proveedor, nombre, email) VALUES (?, ?, ?)',
          [num_proveedor, nombre, email || null]
        );
        existentes.add(num_proveedor);
        nuevos++;
      } catch (insErr) {
        // Si hay duplicado por email u otro, lo omitimos
        if (insErr.code === 'ER_DUP_ENTRY') {
          omitidos++;
        } else {
          throw insErr;
        }
      }
    }

    const mensaje = `Carga correcta. Se importaron ${nuevos} proveedores nuevos.`;
    res.json({
      mensaje,
      nuevos,
      omitidos,
      total_filas: rows.length
    });
  } catch (err) {
    logger.error('[importarExcel proveedores]', err);
    if (err.message && err.message.includes('Solo archivos Excel')) {
      return res.status(400).json({ mensaje: err.message });
    }
    res.status(500).json({ mensaje: 'Error al procesar el archivo Excel' });
  }
}

/**
 * Exporta proveedores a Excel.
 * Primeras 3 columnas = formato de carga (No. Proveedor, Nombre, Email).
 * Columnas extra del sistema: Teléfono, RFC, Notas, Activo.
 * Query: activos=true | busqueda=texto
 */
async function exportarExcel(req, res) {
  try {
    const soloActivos = req.query.activos === 'true';
    const busqueda = String(req.query.busqueda || '').trim().toLowerCase();

    let provs = await _listar(soloActivos);
    if (busqueda) {
      provs = provs.filter((p) =>
        (p.nombre || '').toLowerCase().includes(busqueda)
        || (p.num_proveedor || '').toLowerCase().includes(busqueda)
        || (p.email || '').toLowerCase().includes(busqueda)
        || (p.rfc || '').toLowerCase().includes(busqueda)
        || (p.telefono || '').toLowerCase().includes(busqueda)
      );
    }

    const data = [
      ['No. Proveedor', 'Nombre', 'Email', 'Teléfono', 'RFC', 'Notas', 'Activo'],
      ...provs.map((p) => [
        p.num_proveedor || '',
        p.nombre || '',
        p.email || '',
        p.telefono || '',
        p.rfc || '',
        p.notas || '',
        p.activo ? 'Sí' : 'No',
      ]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    // Anchos legibles
    ws['!cols'] = [
      { wch: 14 },
      { wch: 36 },
      { wch: 32 },
      { wch: 16 },
      { wch: 16 },
      { wch: 28 },
      { wch: 8 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Proveedores');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fecha = new Date().toISOString().slice(0, 10);
    const nombre = soloActivos
      ? `proveedores_activos_${fecha}.xlsx`
      : `proveedores_${fecha}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(buffer);
  } catch (err) {
    logger.error('[exportarExcel proveedores]', err);
    res.status(500).json({ mensaje: 'Error al exportar proveedores' });
  }
}

export { listar, obtener, crear, actualizar, cambiarEstado, importarExcel, exportarExcel };
