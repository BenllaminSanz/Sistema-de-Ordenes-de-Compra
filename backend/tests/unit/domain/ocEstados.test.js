import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSICIONES_OC,
  puedeTransicionOc,
} from '../../../src/domain/ocEstados.js';

describe('domain/ocEstados — puedeTransicionOc', () => {
  it('flujo feliz generada → distribuida → en_proceso', () => {
    assert.equal(puedeTransicionOc('generada', 'distribuida'), true);
    assert.equal(puedeTransicionOc('distribuida', 'en_proceso'), true);
  });

  it('cancelación desde estados activos', () => {
    assert.equal(puedeTransicionOc('generada', 'cancelada'), true);
    assert.equal(puedeTransicionOc('distribuida', 'cancelada'), true);
    assert.equal(puedeTransicionOc('en_proceso', 'cancelada'), true);
  });

  it('regresos permitidos', () => {
    assert.equal(puedeTransicionOc('distribuida', 'generada'), true);
    assert.equal(puedeTransicionOc('en_proceso', 'distribuida'), true);
    assert.equal(puedeTransicionOc('recibida', 'en_proceso'), true);
  });

  it('cierre desde en_proceso o recibida', () => {
    assert.equal(puedeTransicionOc('en_proceso', 'cerrada'), true);
    assert.equal(puedeTransicionOc('recibida', 'cerrada'), true);
    assert.equal(puedeTransicionOc('generada', 'cerrada'), false);
  });

  it('estados terminales sin salidas', () => {
    assert.deepEqual(TRANSICIONES_OC.cerrada, []);
    assert.deepEqual(TRANSICIONES_OC.cancelada, []);
    assert.equal(puedeTransicionOc('cerrada', 'en_proceso'), false);
    assert.equal(puedeTransicionOc('cancelada', 'generada'), false);
  });

  it('no salta generada → en_proceso', () => {
    assert.equal(puedeTransicionOc('generada', 'en_proceso'), false);
  });
});
