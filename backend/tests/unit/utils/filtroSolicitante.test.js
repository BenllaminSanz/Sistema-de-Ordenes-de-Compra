import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarFiltroSolicitante,
  normalizarFechaRecepcion,
} from '../../../src/utils/filtroSolicitante.js';

describe('aplicarFiltroSolicitante', () => {
  it('solicitante sin query → solo los suyos', () => {
    const f = aplicarFiltroSolicitante({ id: 3, rol: 'solicitante' }, undefined, {});
    assert.equal(f.solicitante_id, 3);
  });

  it('solicitante con all → sin filtro', () => {
    const f = aplicarFiltroSolicitante({ id: 3, rol: 'solicitante' }, 'all', { solicitante_id: 'all' });
    assert.equal(f.solicitante_id, undefined);
  });

  it('compras sin query → todos', () => {
    const f = aplicarFiltroSolicitante({ id: 2, rol: 'compras' }, '', {});
    assert.equal(f.solicitante_id, undefined);
  });
});

describe('normalizarFechaRecepcion', () => {
  it('acepta YYYY-MM-DD', () => {
    assert.equal(normalizarFechaRecepcion('2025-11-15'), '2025-11-15 12:00:00');
  });

  it('vacío es null', () => {
    assert.equal(normalizarFechaRecepcion(''), null);
  });
});
