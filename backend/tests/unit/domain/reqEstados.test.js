import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSICIONES_REQ,
  puedeTransicionReq,
  puedeCambiarEstadoRequerimiento,
} from '../../../src/domain/reqEstados.js';

describe('domain/reqEstados — puedeTransicionReq (modelo)', () => {
  it('borrador → en_revision', () => {
    assert.equal(puedeTransicionReq('borrador', 'en_revision'), true);
  });

  it('en_revision → recibido | rechazado', () => {
    assert.equal(puedeTransicionReq('en_revision', 'recibido'), true);
    assert.equal(puedeTransicionReq('en_revision', 'rechazado'), true);
    assert.equal(puedeTransicionReq('en_revision', 'aprobado'), false);
  });

  it('recibido → aprobado | incompleto | rechazado | en_revision', () => {
    for (const dest of ['aprobado', 'incompleto', 'rechazado', 'en_revision']) {
      assert.equal(puedeTransicionReq('recibido', dest), true, dest);
    }
    assert.equal(puedeTransicionReq('recibido', 'borrador'), false);
  });

  it('estados terminales no tienen salidas', () => {
    assert.equal(puedeTransicionReq('rechazado', 'en_revision'), false);
    assert.equal(puedeTransicionReq('cerrado', 'aprobado'), false);
    assert.deepEqual(TRANSICIONES_REQ.rechazado, []);
    assert.deepEqual(TRANSICIONES_REQ.cerrado, []);
  });

  it('aprobado puede regresar a recibido o en_revision (pre-OC)', () => {
    assert.equal(puedeTransicionReq('aprobado', 'recibido'), true);
    assert.equal(puedeTransicionReq('aprobado', 'en_revision'), true);
    assert.equal(puedeTransicionReq('aprobado', 'cerrado'), true);
  });

  it('estado desconocido no permite nada', () => {
    assert.equal(puedeTransicionReq('desconocido', 'en_revision'), false);
  });
});

describe('domain/reqEstados — puedeCambiarEstadoRequerimiento (por rol)', () => {
  it('admin siempre puede (la máquina de modelo se valida aparte)', () => {
    assert.equal(puedeCambiarEstadoRequerimiento('admin', 'borrador', 'cerrado'), true);
    assert.equal(puedeCambiarEstadoRequerimiento('admin', 'en_revision', 'recibido'), true);
  });

  it('solicitante solo envía a revisión desde borrador o incompleto', () => {
    assert.equal(puedeCambiarEstadoRequerimiento('solicitante', 'borrador', 'en_revision'), true);
    assert.equal(puedeCambiarEstadoRequerimiento('solicitante', 'incompleto', 'en_revision'), true);
    assert.equal(puedeCambiarEstadoRequerimiento('solicitante', 'en_revision', 'recibido'), false);
    assert.equal(puedeCambiarEstadoRequerimiento('solicitante', 'recibido', 'aprobado'), false);
    assert.equal(puedeCambiarEstadoRequerimiento('solicitante', 'aprobado', 'cerrado'), false);
  });

  it('compras puede acusar recibo y decidir', () => {
    assert.equal(puedeCambiarEstadoRequerimiento('compras', 'en_revision', 'recibido'), true);
    assert.equal(puedeCambiarEstadoRequerimiento('compras', 'recibido', 'aprobado'), true);
    assert.equal(puedeCambiarEstadoRequerimiento('compras', 'recibido', 'incompleto'), true);
    assert.equal(puedeCambiarEstadoRequerimiento('compras', 'en_revision', 'rechazado'), true);
  });

  it('compras no salta en_revision → aprobado (debe pasar por recibido)', () => {
    assert.equal(puedeCambiarEstadoRequerimiento('compras', 'en_revision', 'aprobado'), false);
  });

  it('compras puede regresar desde aprobado', () => {
    assert.equal(puedeCambiarEstadoRequerimiento('compras', 'aprobado', 'recibido'), true);
    assert.equal(puedeCambiarEstadoRequerimiento('compras', 'aprobado', 'en_revision'), true);
  });
});
