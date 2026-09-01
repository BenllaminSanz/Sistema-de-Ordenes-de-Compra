import { it } from 'node:test';
import assert from 'node:assert/strict';
import { describeIntegration } from '../helpers/integration.js';
import { agentFor } from '../helpers/auth.js';
import { createRequerimiento, patchEstado } from '../helpers/factories.js';
import { query } from '../helpers/db.js';
import { ejecutarPurgaBorradores } from '../../src/utils/purgaBorradores.js';

describeIntegration('Purga mensual de borradores e incompletos', () => {
  async function envejecer(id, createdAt) {
    await query('UPDATE requerimientos SET created_at = ? WHERE id = ?', [createdAt, id]);
  }

  async function aIncompleto(asUser) {
    const created = await createRequerimiento(asUser);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.id;
    let r = await patchEstado(asUser, id, 'en_revision');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await patchEstado('compras', id, 'recibido');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await patchEstado('compras', id, 'incompleto', 'Falta dato');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  }

  it('el 1 de septiembre borra julio (borrador, en revisión e incompleto) y deja agosto', async () => {
    const julBorr = await createRequerimiento('sol1', { titulo_solicitud: 'Borrador julio' });
    assert.equal(julBorr.status, 201);
    await envejecer(julBorr.body.id, '2026-07-15 18:00:00');

    const julInc = await aIncompleto('sol1');
    await envejecer(julInc.id, '2026-07-20 18:00:00');

    const agoBorr = await createRequerimiento('sol1', { titulo_solicitud: 'Borrador agosto' });
    assert.equal(agoBorr.status, 201);
    await envejecer(agoBorr.body.id, '2026-08-15 18:00:00');

    const julRev = await createRequerimiento('sol2', { titulo_solicitud: 'En revision julio' });
    assert.equal(julRev.status, 201);
    const env = await patchEstado('sol2', julRev.body.id, 'en_revision');
    assert.equal(env.status, 200, JSON.stringify(env.body));
    await envejecer(julRev.body.id, '2026-07-10 18:00:00');

    const julRec = await createRequerimiento('sol1', { titulo_solicitud: 'Recibido julio' });
    assert.equal(julRec.status, 201);
    await patchEstado('sol1', julRec.body.id, 'en_revision');
    await patchEstado('compras', julRec.body.id, 'recibido');
    await envejecer(julRec.body.id, '2026-07-05 18:00:00');

    const r = await ejecutarPurgaBorradores({ forzar: true, hoy: '2026-09-01' });
    assert.equal(r.success, true);
    assert.equal(r.corte, '2026-08-01');
    assert.ok(r.borrados >= 3, JSON.stringify(r));
    assert.ok(r.ids.includes(julBorr.body.id));
    assert.ok(r.ids.includes(julInc.id));
    assert.ok(r.ids.includes(julRev.body.id));
    assert.ok(!r.ids.includes(agoBorr.body.id));
    assert.ok(!r.ids.includes(julRec.body.id));

    const goneBorr = await agentFor('sol1').get(`/api/requerimientos/${julBorr.body.id}`);
    assert.equal(goneBorr.status, 404);
    const goneInc = await agentFor('sol1').get(`/api/requerimientos/${julInc.id}`);
    assert.equal(goneInc.status, 404);
    const goneRev = await agentFor('compras').get(`/api/requerimientos/${julRev.body.id}`);
    assert.equal(goneRev.status, 404);
    const keepAgo = await agentFor('sol1').get(`/api/requerimientos/${agoBorr.body.id}`);
    assert.equal(keepAgo.status, 200);
    const keepRec = await agentFor('compras').get(`/api/requerimientos/${julRec.body.id}`);
    assert.equal(keepRec.status, 200);
    assert.equal(keepRec.body.estado, 'recibido');
  });

  it('sin forzar no vuelve a correr en el mismo mes', async () => {
    const created = await createRequerimiento('sol1');
    await envejecer(created.body.id, '2026-07-01 12:00:00');
    const first = await ejecutarPurgaBorradores({ forzar: true, hoy: '2026-09-01' });
    assert.equal(first.success, true);

    const second = await ejecutarPurgaBorradores({ forzar: false, hoy: '2026-09-15' });
    assert.equal(second.skipped, true);
    assert.equal(second.reason, 'ya_ejecutada');
  });

  it('compras no dispara la purga; admin sí', async () => {
    const no = await agentFor('compras').post('/api/notificaciones/purga-borradores');
    assert.equal(no.status, 403);
    const ok = await agentFor('admin').post('/api/notificaciones/purga-borradores');
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.success, true);
  });

  it('admin puede detener la purga: no borra aunque se fuerce', async () => {
    const get1 = await agentFor('admin').get('/api/config/smtp');
    assert.equal(get1.status, 200);
    assert.equal(get1.body.notificaciones.purga_borradores, true);

    const off = await agentFor('admin')
      .put('/api/config/notificaciones')
      .send({ purga_borradores: false });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(off.body.notificaciones.purga_borradores, false);

    const created = await createRequerimiento('sol1', { titulo_solicitud: 'No borrar con purga off' });
    assert.equal(created.status, 201);
    await envejecer(created.body.id, '2026-07-01 12:00:00');

    const r = await ejecutarPurgaBorradores({ forzar: true, hoy: '2026-09-01' });
    assert.equal(r.skipped, true);
    assert.equal(r.reason, 'purga_off');

    const keep = await agentFor('sol1').get(`/api/requerimientos/${created.body.id}`);
    assert.equal(keep.status, 200);

    const on = await agentFor('admin')
      .put('/api/config/notificaciones')
      .send({ purga_borradores: true });
    assert.equal(on.body.notificaciones.purga_borradores, true);
  });
});
