import { it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describeIntegration } from '../helpers/integration.js';
import { agentFor } from '../helpers/auth.js';
import { getApp } from '../helpers/app.js';
import {
  createRequerimiento,
  patchEstado,
  reqAprobadoSinCotizacion,
} from '../helpers/factories.js';

describeIntegration('Dashboard y bandejas', () => {
  it('D01 — stats de solicitante son la vista general', async () => {
    await createRequerimiento('sol1');
    await createRequerimiento('sol2');
    await patchEstado('sol1', (await createRequerimiento('sol1')).body.id, 'en_revision');

    const resSol1 = await agentFor('sol1').get('/api/dashboard/stats');
    assert.equal(resSol1.status, 200);
    assert.equal(resSol1.body.alcance, 'global');

    const resSol2 = await agentFor('sol2').get('/api/dashboard/stats');
    assert.equal(resSol2.status, 200);
    assert.equal(resSol2.body.alcance, 'global');

    const totalSol1 = (resSol1.body.estados_req_hist || []).reduce(
      (s, r) => s + Number(r.total || 0),
      0
    );
    const totalSol2 = (resSol2.body.estados_req_hist || []).reduce(
      (s, r) => s + Number(r.total || 0),
      0
    );
    assert.equal(totalSol1, totalSol2);

    const resCompras = await agentFor('compras').get('/api/dashboard/stats');
    assert.equal(resCompras.status, 200);
    assert.equal(resCompras.body.alcance, 'global');
    const totalGlobal = (resCompras.body.estados_req_hist || []).reduce(
      (s, r) => s + Number(r.total || 0),
      0
    );
    assert.ok(totalGlobal >= 3);
    assert.equal(totalSol1, totalGlobal);
  });

  it('D02 — bandeja compras: por_recibir cuenta en_revision', async () => {
    const a = await createRequerimiento('sol1');
    const b = await createRequerimiento('sol2');
    await patchEstado('sol1', a.body.id, 'en_revision');
    await patchEstado('sol2', b.body.id, 'en_revision');

    // Uno a recibido
    await patchEstado('compras', a.body.id, 'recibido');

    const res = await agentFor('compras').get('/api/notificaciones/bandeja?cola=por_recibir');
    assert.equal(res.status, 200);
    assert.equal(res.body.tipo, 'compras');
    assert.equal(Number(res.body.contadores.por_recibir), 1);
    assert.equal(Number(res.body.contadores.en_proceso), 1); // recibido
    assert.ok(Array.isArray(res.body.items));
    assert.ok(res.body.items.every((i) => i.estado === 'en_revision'));
  });

  it('bandeja listos_oc cuenta aprobados sin OC', async () => {
    await reqAprobadoSinCotizacion('sol1');
    const res = await agentFor('compras').get('/api/notificaciones/bandeja?cola=listos_oc');
    assert.equal(res.status, 200);
    assert.equal(Number(res.body.contadores.listos_oc), 1);
  });

  it('campana del solicitante sigue siendo de sus REQ', async () => {
    const r1 = await createRequerimiento('sol1');
    await patchEstado('sol1', r1.body.id, 'en_revision');
    const r2 = await createRequerimiento('sol2');
    await patchEstado('sol2', r2.body.id, 'en_revision');

    const res = await agentFor('sol1').get('/api/notificaciones/bandeja');
    assert.equal(res.status, 200);
    assert.notEqual(res.body.tipo, 'compras');
    const pendientes = res.body.contadores?.pendientes ?? res.body.total ?? res.body.pendientes;
    assert.ok(Number(pendientes) >= 1);
  });

  it('bandeja general del dashboard incluye REQ de otros', async () => {
    const r1 = await createRequerimiento('sol1');
    await patchEstado('sol1', r1.body.id, 'en_revision');
    const r2 = await createRequerimiento('sol2');
    await patchEstado('sol2', r2.body.id, 'en_revision');

    const res = await agentFor('sol1').get('/api/notificaciones/bandeja?vista=general&cola=por_recibir');
    assert.equal(res.status, 200);
    assert.equal(res.body.tipo, 'compras');
    assert.ok(Number(res.body.contadores.por_recibir) >= 2);
    const ids = (res.body.items || []).map((i) => i.id);
    assert.ok(ids.includes(r1.body.id));
    assert.ok(ids.includes(r2.body.id));
  });

  it('solicitante ve aviso in-app al marcar incompleto (sin correo a él)', async () => {
    const created = await createRequerimiento('sol1');
    await patchEstado('sol1', created.body.id, 'en_revision');
    await patchEstado('compras', created.body.id, 'recibido');
    await patchEstado('compras', created.body.id, 'incompleto', 'Falta ficha técnica');

    const res = await agentFor('sol1').get('/api/notificaciones/bandeja');
    assert.equal(res.status, 200);
    const avisos = res.body.avisos || [];
    assert.ok(avisos.some((a) => a.tipo_evento === 'incompleto'));
    assert.ok(avisos.every((a) => a.requerimiento_id === created.body.id));
  });

  it('solicitante ve aviso de nota nueva', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const nota = await agentFor('compras')
      .patch(`/api/requerimientos/${req.id}/notas`)
      .send({ notas: 'Cotización compartida, pendiente de visto bueno' });
    assert.equal(nota.status, 200);

    const res = await agentFor('sol1').get('/api/notificaciones/bandeja');
    const avisos = res.body.avisos || [];
    assert.ok(avisos.some((a) => a.tipo_evento === 'nota' && /Cotización compartida/.test(a.resumen || '')));
  });

  it('D03 — stats globales no dependen del id del JWT', async () => {
    const token = jwt.sign(
      { nombre: 'Roto', email: 'roto@test.local', rol: 'solicitante' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(getApp())
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.alcance, 'global');
    assert.ok(Array.isArray(res.body.estados_req));
  });

  it('bandeja-oc responde para compras', async () => {
    const res = await agentFor('compras').get('/api/notificaciones/bandeja-oc');
    assert.equal(res.status, 200);
    // Estructura flexible: contadores o colas
    assert.ok(res.body && typeof res.body === 'object');
  });
});
