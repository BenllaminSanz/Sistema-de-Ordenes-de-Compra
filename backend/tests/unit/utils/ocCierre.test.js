import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  recepcionListaParaCierre,
  validarCierreOrden,
} from '../../../src/utils/ocCierre.js';

/**
 * Mock mínimo de conexión mysql2 según las queries de ocCierre.js
 */
function makeConn({
  ocPo = null,
  recPo = null,
  totalRecepciones = 0,
  parciales = 0,
} = {}) {
  return {
    async query(sql) {
      const s = String(sql);

      if (s.includes('FROM ordenes_compra') && s.includes('datatextnow_id')) {
        return [[{ datatextnow_id: ocPo }]];
      }

      if (
        s.includes('FROM recepciones')
        && s.includes('datatextnow_id')
        && s.includes('ORDER BY')
      ) {
        return [[{ datatextnow_id: recPo }]];
      }

      if (s.includes("estado = 'recibido_parcial'")) {
        return [[{ cnt: parciales }]];
      }

      if (s.includes('COUNT(*)') && s.includes('FROM recepciones')) {
        return [[{ cnt: totalRecepciones }]];
      }

      throw new Error(`Query no mockeada en test: ${s.slice(0, 120)}`);
    },
  };
}

describe('utils/ocCierre — recepcionListaParaCierre', () => {
  it('acepta parcial y completo', () => {
    assert.equal(recepcionListaParaCierre('recibido_completo'), true);
    assert.equal(recepcionListaParaCierre('recibido_parcial'), true);
  });

  it('rechaza otros estados', () => {
    assert.equal(recepcionListaParaCierre('pendiente'), false);
    assert.equal(recepcionListaParaCierre(null), false);
  });
});

describe('utils/ocCierre — validarCierreOrden', () => {
  it('falla sin recepciones', async () => {
    const conn = makeConn({ totalRecepciones: 0, ocPo: 'PO-1' });
    const r = await validarCierreOrden(conn, 1);
    assert.equal(r.ok, false);
    assert.match(r.mensaje, /recepción/i);
  });

  it('falla sin PO en OC ni en recepciones', async () => {
    const conn = makeConn({ totalRecepciones: 1, ocPo: null, recPo: null });
    const r = await validarCierreOrden(conn, 1);
    assert.equal(r.ok, false);
    assert.match(r.mensaje, /DataTextNow|PO/i);
  });

  it('acepta PO en la OC', async () => {
    const conn = makeConn({ totalRecepciones: 2, ocPo: 'DTN-99' });
    const r = await validarCierreOrden(conn, 1);
    assert.equal(r.ok, true);
    assert.equal(r.po, 'DTN-99');
  });

  it('acepta PO = NA', async () => {
    const conn = makeConn({ totalRecepciones: 1, ocPo: 'NA' });
    const r = await validarCierreOrden(conn, 1);
    assert.equal(r.ok, true);
    assert.equal(r.po, 'NA');
  });

  it('usa PO de la última recepción si la OC no tiene', async () => {
    const conn = makeConn({ totalRecepciones: 1, ocPo: null, recPo: 'PO-REC' });
    const r = await validarCierreOrden(conn, 1);
    assert.equal(r.ok, true);
    assert.equal(r.po, 'PO-REC');
  });

  it('con permitirParcial=false bloquea si hay parciales', async () => {
    const conn = makeConn({
      totalRecepciones: 2,
      ocPo: 'PO-1',
      parciales: 1,
    });
    const r = await validarCierreOrden(conn, 1, { permitirParcial: false });
    assert.equal(r.ok, false);
    assert.match(r.mensaje, /parcial/i);
  });

  it('por defecto permite parciales si hay PO', async () => {
    const conn = makeConn({
      totalRecepciones: 1,
      ocPo: 'PO-1',
      parciales: 1,
    });
    const r = await validarCierreOrden(conn, 1);
    assert.equal(r.ok, true);
  });
});
