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
  it('D01 — stats solicitante alcance propio (no ve REQ ajenos en conteos)', async () => {
    await createRequerimiento('sol1');
    await createRequerimiento('sol2');
    await patchEstado('sol1', (await createRequerimiento('sol1')).body.id, 'en_revision');

    const resSol1 = await agentFor('sol1').get('/api/dashboard/stats');
    assert.equal(resSol1.status, 200);
    assert.equal(resSol1.body.alcance, 'propio');

    const resSol2 = await agentFor('sol2').get('/api/dashboard/stats');
    assert.equal(resSol2.status, 200);
    assert.equal(resSol2.body.alcance, 'propio');

    // Histórico de sol1 debe tener más o igual borradores/en_revision que solo los suyos
    const totalSol1 = (resSol1.body.estados_req_hist || []).reduce(
      (s, r) => s + Number(r.total || 0),
      0
    );
    const totalSol2 = (resSol2.body.estados_req_hist || []).reduce(
      (s, r) => s + Number(r.total || 0),
      0
    );
    // sol1 creó 2 (+1 a revisión); sol2 creó 1
    assert.ok(totalSol1 >= 2, `sol1 total=${totalSol1}`);
    assert.equal(totalSol2, 1, `sol2 total=${totalSol2}`);

    const resCompras = await agentFor('compras').get('/api/dashboard/stats');
    assert.equal(resCompras.status, 200);
    assert.equal(resCompras.body.alcance, 'global');
    const totalGlobal = (resCompras.body.estados_req_hist || []).reduce(
      (s, r) => s + Number(r.total || 0),
      0
    );
    assert.ok(totalGlobal >= totalSol1 + totalSol2);
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

  it('bandeja solicitante solo ve lo propio', async () => {
    const r1 = await createRequerimiento('sol1');
    await patchEstado('sol1', r1.body.id, 'en_revision');
    const r2 = await createRequerimiento('sol2');
    await patchEstado('sol2', r2.body.id, 'en_revision');

    const res = await agentFor('sol1').get('/api/notificaciones/bandeja');
    assert.equal(res.status, 200);
    assert.notEqual(res.body.tipo, 'compras');
    // items solo del solicitante 1 si vienen
    if (Array.isArray(res.body.items) && res.body.items.length) {
      assert.ok(
        res.body.items.every(
          (i) =>
            !i.solicitante_nombre
            || i.solicitante_nombre.includes('Uno')
            || i.solicitante_id === 3
        )
      );
    }
    // pendientes propios >= 1
    const pendientes = res.body.contadores?.pendientes ?? res.body.total ?? res.body.pendientes;
    assert.ok(Number(pendientes) >= 1);
  });

  it('D03 — solicitante sin id válido → stats vacíos (fail-closed)', async () => {
    const token = jwt.sign(
      { nombre: 'Roto', email: 'roto@test.local', rol: 'solicitante' }, // sin id
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(getApp())
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.alcance, 'propio');
    assert.deepEqual(res.body.estados_req, []);
    assert.ok(res.body.aviso);
  });

  it('bandeja-oc responde para compras', async () => {
    const res = await agentFor('compras').get('/api/notificaciones/bandeja-oc');
    assert.equal(res.status, 200);
    // Estructura flexible: contadores o colas
    assert.ok(res.body && typeof res.body === 'object');
  });
});
