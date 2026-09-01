import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEADERS_BASE_GRAL,
  parseExcelRequerimientos,
  statusDesdeNotas,
  detalleRequerimientoExport,
} from '../../../src/utils/excelRequerimientos.js';
import { buildXlsxBuffer } from '../../helpers/excel.js';

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
});
