import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDiasReporte,
  serializarDiasReporte,
  esDiaDeReporteDiario,
} from '../../../src/utils/diasReporte.js';

describe('parseDiasReporte', () => {
  it('vacío o inválido → lunes a viernes', () => {
    assert.deepEqual(parseDiasReporte(''), [1, 2, 3, 4, 5]);
    assert.deepEqual(parseDiasReporte(null), [1, 2, 3, 4, 5]);
    assert.deepEqual(parseDiasReporte('8,9'), [1, 2, 3, 4, 5]);
  });

  it('acepta lista y deduplica', () => {
    assert.deepEqual(parseDiasReporte('1,3,5,5'), [1, 3, 5]);
    assert.deepEqual(parseDiasReporte([7, 1, 1]), [1, 7]);
  });

  it('serializa ISO 1=lun…7=dom', () => {
    assert.equal(serializarDiasReporte([5, 1, 2]), '1,2,5');
  });
});

describe('esDiaDeReporteDiario', () => {
  const lv = { reporte_diario_dias: [1, 2, 3, 4, 5] };

  it('lunes de L-V sí, sábado no', () => {
    // 2026-08-31 = lunes; 2026-09-05 = sábado (hora México)
    assert.equal(esDiaDeReporteDiario(lv, new Date('2026-08-31T15:00:00Z')), true);
    assert.equal(esDiaDeReporteDiario(lv, new Date('2026-09-05T15:00:00Z')), false);
  });

  it('respeta días elegidos', () => {
    const soloMie = { reporte_diario_dias: [3] };
    assert.equal(esDiaDeReporteDiario(soloMie, new Date('2026-09-02T15:00:00Z')), true);
    assert.equal(esDiaDeReporteDiario(soloMie, new Date('2026-08-31T15:00:00Z')), false);
  });
});
