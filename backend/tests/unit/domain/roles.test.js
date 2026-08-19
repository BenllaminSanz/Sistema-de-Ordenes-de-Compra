import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES_VALIDOS,
  normalizarRol,
  esRolValido,
  puedeGestionarUsuario,
  puedeAsignarRol,
} from '../../../src/domain/roles.js';

describe('domain/roles — normalizarRol', () => {
  it('mapea contabilidad → compras', () => {
    assert.equal(normalizarRol('contabilidad'), 'compras');
  });

  it('deja intactos los roles actuales', () => {
    assert.equal(normalizarRol('compras'), 'compras');
    assert.equal(normalizarRol('admin'), 'admin');
    assert.equal(normalizarRol('solicitante'), 'solicitante');
  });

  it('no altera valores desconocidos', () => {
    assert.equal(normalizarRol('otro'), 'otro');
    assert.equal(normalizarRol(undefined), undefined);
  });
});

describe('domain/roles — esRolValido', () => {
  it('acepta roles válidos y legacy contabilidad', () => {
    for (const r of ROLES_VALIDOS) {
      assert.equal(esRolValido(r), true);
    }
    assert.equal(esRolValido('contabilidad'), true);
  });

  it('rechaza roles inválidos', () => {
    assert.equal(esRolValido('gerente'), false);
    assert.equal(esRolValido(''), false);
  });
});

describe('domain/roles — puedeGestionarUsuario', () => {
  const admin = { id: 1, rol: 'admin' };
  const compras = { id: 2, rol: 'compras' };
  const sol = { id: 3, rol: 'solicitante' };
  const contabilidad = { id: 4, rol: 'contabilidad' };

  it('admin gestiona a cualquiera', () => {
    assert.equal(puedeGestionarUsuario(admin, sol), true);
    assert.equal(puedeGestionarUsuario(admin, compras), true);
    assert.equal(puedeGestionarUsuario(admin, admin), true);
  });

  it('compras gestiona no-admin', () => {
    assert.equal(puedeGestionarUsuario(compras, sol), true);
    assert.equal(puedeGestionarUsuario(compras, compras), true);
    assert.equal(puedeGestionarUsuario(compras, admin), false);
  });

  it('legacy contabilidad se trata como compras', () => {
    assert.equal(puedeGestionarUsuario(contabilidad, sol), true);
    assert.equal(puedeGestionarUsuario(contabilidad, admin), false);
    assert.equal(puedeGestionarUsuario(compras, { rol: 'contabilidad' }), true);
  });

  it('solicitante no gestiona usuarios', () => {
    assert.equal(puedeGestionarUsuario(sol, sol), false);
    assert.equal(puedeGestionarUsuario(sol, compras), false);
  });

  it('actor o target nulos → false', () => {
    assert.equal(puedeGestionarUsuario(null, sol), false);
    assert.equal(puedeGestionarUsuario(admin, null), false);
  });
});

describe('domain/roles — puedeAsignarRol', () => {
  const admin = { rol: 'admin' };
  const compras = { rol: 'compras' };
  const sol = { rol: 'solicitante' };

  it('admin puede asignar cualquier rol válido', () => {
    assert.equal(puedeAsignarRol(admin, 'admin'), true);
    assert.equal(puedeAsignarRol(admin, 'compras'), true);
    assert.equal(puedeAsignarRol(admin, 'solicitante'), true);
    assert.equal(puedeAsignarRol(admin, 'contabilidad'), true); // normaliza a compras
  });

  it('compras no puede asignar admin', () => {
    assert.equal(puedeAsignarRol(compras, 'admin'), false);
    assert.equal(puedeAsignarRol(compras, 'compras'), true);
    assert.equal(puedeAsignarRol(compras, 'solicitante'), true);
  });

  it('solicitante no puede asignar roles', () => {
    assert.equal(puedeAsignarRol(sol, 'solicitante'), false);
    assert.equal(puedeAsignarRol(sol, 'compras'), false);
  });

  it('rechaza rol inválido', () => {
    assert.equal(puedeAsignarRol(admin, 'superuser'), false);
  });
});
