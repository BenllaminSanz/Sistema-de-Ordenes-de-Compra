import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEADERS_BASE_GRAL,
  HEADERS_REQUERIMIENTOS_POR_ITEM,
  parseExcelRequerimientos,
  statusDesdeNotas,
  detalleRequerimientoExport,
  generarExcelOrdenesPorItem,
  generarExcelRequerimientos,
  parseNumeroExcel,
} from '../../../src/utils/excelRequerimientos.js';
import { buildXlsxBuffer, readXlsxRows } from '../../helpers/excel.js';

describe('excelRequerimientos — título vs Status', () => {
  it('statusDesdeNotas acepta prefijo legado y texto libre', () => {
    assert.equal(statusDesdeNotas('Status: Pendiente de factura | Import: x'), 'Pendiente de factura');
    assert.equal(statusDesdeNotas('Pendiente de factura'), 'Pendiente de factura');
    assert.equal(statusDesdeNotas(''), '');
  });

  it('detalleRequerimientoExport es solo el título', () => {
    assert.equal(
      detalleRequerimientoExport({
        titulo_solicitud: 'Aceite hidráulico línea 3',
        notas: 'Pendiente de factura',
        items_resumen: 'ACE-1 x 2',
      }),
      'Aceite hidráulico línea 3'
    );
  });

  it('parse BASE GRAL: Tipo de servicio → título, Status → notas', () => {
    const rows = [
      HEADERS_BASE_GRAL,
      [
        '', '', '2026P-888', '', 'PARTES',
        '', '', '', '', 'Solicitante Uno',
        'Aprobado', 'ADMINISTRACIÓN', 'MATERIAL DE OFICINA-55500', '31',
        'Aceite hidráulico línea 3', '', 'Pendiente de factura',
      ],
    ];
    const parsed = parseExcelRequerimientos(buildXlsxBuffer(rows));
    assert.ok(parsed.filas.length >= 1, JSON.stringify(parsed));
    const f = parsed.filas.find((x) => String(x.consecutivo).includes('2026P-888'));
    assert.ok(f, JSON.stringify(parsed.filas.slice(0, 2)));
    assert.equal(f.titulo, 'Aceite hidráulico línea 3');
    assert.equal(f.notas, 'Pendiente de factura');
    assert.equal(f.status_texto, 'Pendiente de factura');
    assert.ok(!String(f.notas).includes('Aceite'));
  });

  it('parse Excel por ítem: Descripción del ítem → título (no el N°)', () => {
    const rows = [
      HEADERS_REQUERIMIENTOS_POR_ITEM,
      [
        '', '', '2026P-777', '', 'PARTES',
        '00001', 'Proveedor Alpha', '', '', 'Solicitante Uno',
        'Borrador', 'ADMINISTRACIÓN', 'MATERIAL DE OFICINA-55500', '31',
        'P-ALPHA-001', 'Tornillo M8 con precio', 2, 'pza', '', '',
        'Bitacora status',
      ],
    ];
    const parsed = parseExcelRequerimientos(buildXlsxBuffer(rows));
    const f = parsed.filas.find((x) => String(x.consecutivo).includes('2026P-777'));
    assert.ok(f, JSON.stringify(parsed.filas.slice(0, 2)));
    assert.equal(f.titulo, 'Tornillo M8 con precio');
    assert.notEqual(f.titulo, '2026P-777');
    assert.notEqual(f.titulo, 'P-ALPHA-001');
    assert.equal(f.notas, 'Bitacora status');
  });
});

describe('excel REQ — precios de catálogo / sugerido', () => {
  it('parseNumeroExcel acepta número, texto con coma y vacío', () => {
    assert.equal(parseNumeroExcel(463), 463);
    assert.equal(parseNumeroExcel('1,500.25'), 1500.25);
    assert.equal(parseNumeroExcel(''), null);
    assert.equal(parseNumeroExcel(null), null);
  });

  it('parse por ítem lee cantidad, unidad y precio unitario', () => {
    const rows = [
      HEADERS_REQUERIMIENTOS_POR_ITEM,
      [
        '', '', '2026P-88002', '', 'PARTES',
        '', '', '', 'MXN', 'Solicitante Uno',
        'Recibido', 'ADMINISTRACIÓN', 'MATERIAL DE OFICINA-55500', '31',
        '', 'PAPEL BOND', 10, 'BO', 45, 450,
        '',
      ],
    ];
    const parsed = parseExcelRequerimientos(buildXlsxBuffer(rows));
    const f = parsed.filas.find((x) => String(x.consecutivo).includes('2026P-88002'));
    assert.ok(f, JSON.stringify(parsed.filas.slice(0, 2)));
    assert.equal(Number(f.cantidad), 10);
    assert.equal(f.unidad, 'BO');
    assert.equal(Number(f.precio_unitario), 45);
    assert.equal(f.titulo, 'PAPEL BOND');
  });

  it('export usa precio de ítem y suma Total si no hay OC/cotización', () => {
    const buf = generarExcelRequerimientos([{
      consecutivo: '2026P-990',
      tipo: 'PARTES',
      estado: 'recibido',
      solicitante_nombre: 'Adrian Velarde',
      area: 'PRODUCCIÓN',
      departamento: 'HILATURA-RS',
      items_reporte: [{
        codigo_catalogo: '1028183',
        descripcion: 'COUPLING INSERT BOWEX',
        cantidad: 2,
        unidad: 'EA',
        precio_unitario: 463,
      }],
    }]);
    const rows = readXlsxRows(buf);
    const headers = rows[0].map(String);
    const idxPrecio = headers.findIndex((h) => /precio unitario/i.test(h));
    const idxTotal = headers.findIndex((h) => /total/i.test(h));
    const idxSub = headers.findIndex((h) => /subtotal/i.test(h));
    const fila = rows.slice(1).find((r) => String(r[2]).includes('2026P-990'));
    assert.ok(fila, JSON.stringify(rows.slice(0, 2)));
    assert.equal(Number(fila[idxPrecio]), 463);
    assert.equal(Number(fila[idxSub]), 926);
    assert.equal(Number(fila[idxTotal]), 926);
  });
});

describe('excel OC — % por entrega', () => {
  it('una fila por recepción, % de esa entrega no el acumulado ni ítem×entrega', () => {
    const buf = generarExcelOrdenesPorItem([{
      orden_compra: 'PO-1',
      n: '2026P-1',
      tipo: 'PARTES',
      estado: 'En proceso',
      items: [
        {
          codigo: 'A-1',
          descripcion: 'Tornillo',
          cantidad_solicitada: 10,
          cantidad_recibida: 4,
          unidad: 'pza',
          pct_entrega: 40,
          fecha_entrega: '2026-03-01',
          numero_recibo: 'R-1',
        },
        {
          codigo: 'A-1',
          descripcion: 'Tornillo',
          cantidad_solicitada: 10,
          cantidad_recibida: 3,
          unidad: 'pza',
          pct_entrega: 30,
          fecha_entrega: '2026-03-15',
          numero_recibo: 'R-2',
        },
      ],
    }]);
    const rows = readXlsxRows(buf);
    const headers = rows[0].map(String);
    const idxPct = headers.findIndex((h) => /%\s*entrega/i.test(h));
    const idxRec = headers.findIndex((h) => /cantidad recibida/i.test(h));
    assert.ok(idxPct >= 0, JSON.stringify(headers));
    const datos = rows.slice(1).filter((r) => r.some((c) => c !== ''));
    assert.equal(datos.length, 2);
    assert.equal(Number(datos[0][idxPct]), 40);
    assert.equal(Number(datos[1][idxPct]), 30);
    assert.equal(Number(datos[0][idxRec]), 4);
    assert.equal(Number(datos[1][idxRec]), 3);
    assert.ok(!datos.some((r) => Number(r[idxPct]) === 70));
  });
});
