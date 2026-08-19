import { it } from 'node:test';
import assert from 'node:assert/strict';
import { describeIntegration } from '../helpers/integration.js';
import { agentFor } from '../helpers/auth.js';
import { createRequerimiento, patchEstado } from '../helpers/factories.js';
import { getSentMails, findMails, flushAsyncMail, clearSentMails } from '../helpers/mail.js';

describeIntegration('Notificaciones config (URL, roles, on/off)', () => {
  it('GET /api/health incluye frontend_url y notif_req_revision', async () => {
    const { getApp } = await import('../helpers/app.js');
    const request = (await import('supertest')).default;
    const res = await request(getApp()).get('/api/health');
    assert.equal(res.status, 200);
    assert.ok(res.body.frontend_url);
    assert.equal(typeof res.body.notif_req_revision, 'boolean');
  });

  it('GET smtp expone lista de destinatarios (admin)', async () => {
    const res = await agentFor('admin').get('/api/config/smtp');
    assert.equal(res.status, 200);
    const n = res.body.notificaciones;
    assert.ok(n);
    assert.equal(n.notif_req_revision, true);
    assert.ok(Array.isArray(n.notif_roles));
    assert.ok(n.notif_roles.includes('compras'));
    assert.ok(n.notif_roles.includes('admin'));
    const emails = (n.destinatarios || []).map((d) => d.email);
    assert.ok(emails.includes('compras@test.local'));
    assert.ok(emails.includes('admin@test.local'));
  });

  it('compras no cambia notificaciones', async () => {
    const res = await agentFor('compras')
      .put('/api/config/notificaciones')
      .send({ notif_req_revision: false });
    assert.equal(res.status, 403);
  });

  it('admin puede dejar solo rol Compras (sin Admin)', async () => {
    const put = await agentFor('admin')
      .put('/api/config/notificaciones')
      .send({ notif_roles: ['compras'] });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const emails = (put.body.notificaciones.destinatarios || []).map((d) => d.email);
    assert.ok(emails.includes('compras@test.local'));
    assert.ok(!emails.includes('admin@test.local'));
    assert.deepEqual(put.body.notificaciones.notif_roles, ['compras']);
  });

  it('con notificaciones apagadas no se envía correo al pasar a en_revision', async () => {
    const off = await agentFor('admin')
      .put('/api/config/notificaciones')
      .send({ notif_req_revision: false });
    assert.equal(off.status, 200);
    assert.equal(off.body.notificaciones.notif_req_revision, false);

    const created = await createRequerimiento('sol1');
    assert.equal(created.status, 201);
    const res = await patchEstado('sol1', created.body.id, 'en_revision');
    assert.equal(res.status, 200);
    await flushAsyncMail(80);
    const notif = findMails({ subjectIncludes: 'revisión' });
    assert.equal(notif.length, 0, `no debía haber aviso: ${JSON.stringify(getSentMails())}`);
  });

  it('admin guarda URL pública y queda en health', async () => {
    const put = await agentFor('admin')
      .put('/api/config/notificaciones')
      .send({ frontend_url: 'https://oc.empresa.test' });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.equal(put.body.notificaciones.frontend_url_efectiva, 'https://oc.empresa.test');
    assert.equal(put.body.notificaciones.frontend_url_es_local, false);

    const { getApp } = await import('../helpers/app.js');
    const request = (await import('supertest')).default;
    const health = await request(getApp()).get('/api/health');
    assert.equal(health.body.frontend_url, 'https://oc.empresa.test');
  });

  it('rechaza URL pública inválida', async () => {
    const res = await agentFor('admin')
      .put('/api/config/notificaciones')
      .send({ frontend_url: 'ftp://malo' });
    assert.equal(res.status, 400);
  });
});
