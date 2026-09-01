import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ymd,
  formatFechaDMY,
  rangoMes,
  parsePeriodoExport,
  sqlRangoFecha,
  cortePurgaBorradores,
} from '../../../src/utils/fechas.js';

describe('fechas — sin desfase UTC-6', () => {
  it('ymd extrae YYYY-MM-DD de string', () => {
    assert.equal(ymd('2026-08-03'), '2026-08-03');
    assert.equal(ymd('2026-08-03T00:00:00.000Z'), '2026-08-03');
  });

  it('ymd de Date UTC midnight no resta un día (bug 2026P-873)', () => {
    const d = new Date(Date.UTC(2026, 7, 3, 0, 0, 0));
    assert.equal(ymd(d), '2026-08-03');
    assert.equal(formatFechaDMY(d), '03/08/2026');
  });

  it('formatFechaDMY de string calendario', () => {
    assert.equal(formatFechaDMY('2026-08-03'), '03/08/2026');
    assert.equal(formatFechaDMY(''), '');
    assert.equal(formatFechaDMY(null), '');
  });

  it('rangoMes de agosto no usa toISOString', () => {
    assert.deepEqual(rangoMes(2026, 8), {
      fecha_desde: '2026-08-01',
      fecha_hasta: '2026-08-31',
    });
    assert.deepEqual(rangoMes(2026, 2), {
      fecha_desde: '2026-02-01',
      fecha_hasta: '2026-02-28',
    });
  });

  it('parsePeriodoExport: año, mes, rango, completo', () => {
    const anio = parsePeriodoExport({ anio: 2026 });
    assert.equal(anio.modo, 'anio');
    assert.equal(anio.fecha_desde, '2026-01-01');
    assert.equal(anio.fecha_hasta, '2026-12-31');

    const mes = parsePeriodoExport({ anio: 2026, mes: 8 });
    assert.equal(mes.modo, 'mes');
    assert.equal(mes.fecha_desde, '2026-08-01');
    assert.equal(mes.fecha_hasta, '2026-08-31');

    const rango = parsePeriodoExport({ fecha_desde: '2026-08-01', fecha_hasta: '2026-08-15' });
    assert.equal(rango.modo, 'rango');
    assert.equal(rango.fecha_desde, '2026-08-01');

    const todo = parsePeriodoExport({}, { defaultCompleto: true });
    assert.equal(todo.modo, 'completo');
    assert.equal(todo.fecha_desde, null);
  });

  it('sqlRangoFecha arma BETWEEN', () => {
    const r = sqlRangoFecha('r.created_at', '2026-01-01', '2026-12-31');
    assert.match(r.sql, /BETWEEN/);
    assert.deepEqual(r.params, ['2026-01-01', '2026-12-31']);
    assert.equal(sqlRangoFecha('c', null, null).sql, '');
  });

  it('cortePurgaBorradores: 1 sep → agosto 1 (borra julio, no agosto)', () => {
    assert.equal(cortePurgaBorradores('2026-09-01'), '2026-08-01');
    assert.equal(cortePurgaBorradores('2026-09-15'), '2026-08-01');
    assert.equal(cortePurgaBorradores('2026-01-01'), '2025-12-01');
  });
});
