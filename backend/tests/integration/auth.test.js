import { it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describeIntegration } from '../helpers/integration.js';
import { getApp } from '../helpers/app.js';
import {
  loginAs,
  agentFor,
  tokenFor,
  TEST_PASSWORD,
  USERS,
} from '../helpers/auth.js';

describeIntegration('Auth', () => {
  it('login correcto devuelve token y rol', async () => {
    const res = await loginAs(USERS.compras.email);
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.usuario.rol, 'compras');
    assert.equal(res.body.usuario.email, USERS.compras.email);
  });

  it('login con password incorrecto → 401', async () => {
    const res = await loginAs(USERS.sol1.email, 'wrong-password');
    assert.equal(res.status, 401);
  });

  it('usuario inactivo no puede entrar', async () => {
    const res = await loginAs(USERS.inactivo.email);
    assert.equal(res.status, 403);
    assert.match(res.body.mensaje || '', /desactiv/i);
  });

  it('email no verificado no puede entrar', async () => {
    const res = await loginAs(USERS.noverif.email);
    assert.equal(res.status, 403);
    assert.match(res.body.mensaje || '', /correo|confirm/i);
  });

  it('ruta protegida sin token → 401', async () => {
    const res = await request(getApp()).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  it('token inválido → 401', async () => {
    const res = await request(getApp())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token-invalido');
    assert.equal(res.status, 401);
  });

  it('JWT con rol contabilidad se normaliza a compras', async () => {
    const token = jwt.sign(
      {
        id: USERS.compras.id,
        email: USERS.compras.email,
        nombre: USERS.compras.nombre,
        rol: 'contabilidad',
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(getApp())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.rol, 'compras');
  });

  it('compras puede listar usuarios', async () => {
    const res = await agentFor('compras').get('/api/auth/usuarios');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body) || Array.isArray(res.body.datos) || Array.isArray(res.body.usuarios));
  });

  it('solicitante puede listar usuarios (filtro de consulta)', async () => {
    const res = await agentFor('sol1').get('/api/auth/usuarios');
    assert.equal(res.status, 200);
    const lista = Array.isArray(res.body) ? res.body : (res.body.datos || res.body.usuarios || []);
    assert.ok(Array.isArray(lista));
    assert.ok(lista.every((u) => u.activo === 1 || u.activo === true));
  });

  it('compras no puede crear usuario admin', async () => {
    const res = await agentFor('compras').post('/api/auth/registro').send({
      nombre: 'Nuevo Admin',
      email: 'nuevo.admin@test.local',
      password: 'Password123!',
      rol: 'admin',
    });
    assert.equal(res.status, 403);
  });

  it('admin puede crear solicitante', async () => {
    const res = await agentFor('admin').post('/api/auth/registro').send({
      nombre: 'Nuevo Solicitante',
      email: 'nuevo.sol@test.local',
      password: 'Password123!',
      rol: 'solicitante',
    });
    assert.equal(res.status, 201);
  });

  it('usuario no puede desactivarse a sí mismo', async () => {
    const res = await agentFor('compras')
      .patch(`/api/auth/usuarios/${USERS.compras.id}/estado`)
      .send({ activo: false });
    assert.ok([400, 403].includes(res.status));
  });
});
