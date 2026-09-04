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

  it('admin guarda días del reporte diario (L-V por defecto)', async () => {
    const get1 = await agentFor('admin').get('/api/config/smtp');
    assert.equal(get1.status, 200);
    assert.deepEqual(get1.body.notificaciones.reporte_diario_dias, [1, 2, 3, 4, 5]);

    const put = await agentFor('admin')
      .put('/api/config/notificaciones')
      .send({ reporte_diario_dias: [1, 3, 5] });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.deepEqual(put.body.notificaciones.reporte_diario_dias, [1, 3, 5]);

    const vacio = await agentFor('admin')
      .put('/api/config/notificaciones')
      .send({ reporte_diario_dias: [] });
    assert.equal(vacio.status, 400);
  });

  it('reporte diario se omite si hoy no está en los días programados', async () => {
    const { diaSemanaMexico } = await import('../../src/models/configApp.js');
    const { enviarReporteDiarioCompras } = await import('../../src/utils/emailService.js');
    const hoy = diaSemanaMexico();
    const otro = hoy === 1 ? 2 : 1;
    const put = await agentFor('admin')
      .put('/api/config/notificaciones')
      .send({ reporte_diario_dias: [otro] });
    assert.equal(put.status, 200, JSON.stringify(put.body));

    const r = await enviarReporteDiarioCompras({ forzar: false });
    assert.equal(r.skipped, true);
    assert.equal(r.reason, 'dia_no_programado');
    const mails = getSentMails();
    assert.ok(!mails.some((m) => /Resumen diario/i.test(m.subject || '')));
  });

  it('admin envía reporte de prueba solo a su correo (no a Compras ni solicitantes)', async () => {
    const res = await agentFor('admin').post('/api/notificaciones/reporte-diario');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.equal(res.body.prueba, true);
    assert.ok((res.body.enviados_a || []).includes('admin@test.local'));
    const { getSentMails } = await import('../helpers/mail.js');
    const mails = getSentMails();
    const diario = mails.find((m) => /Resumen diario/i.test(m.subject || ''));
    assert.ok(diario, `no hubo reporte: ${JSON.stringify(mails)}`);
    assert.match(String(diario.subject || ''), /PRUEBA/i);
    assert.match(String(diario.to || ''), /admin@test.local/i);
    const blob = JSON.stringify(diario).toLowerCase();
    assert.ok(!blob.includes('sol1@test.local'), 'el solicitante no debe recibir el reporte');
    assert.ok(!blob.includes('compras@test.local'), 'Compras/Araceli no debe recibir la prueba');
    assert.match(blob, /órdenes de compra|ordenes de compra|oc generadas|generadas/);
    assert.match(blob, /en revisi[oó]n/);
    assert.ok(!blob.includes('por recibir'), 'REQ debe decir En revisión, no Por recibir');
    assert.ok(!blob.includes('listos para oc') && !blob.includes('listos oc'), 'REQ debe decir Aprobado, no Listos para OC');
  });

  it('compras no dispara el reporte de prueba', async () => {
    const res = await agentFor('compras').post('/api/notificaciones/reporte-diario');
    assert.equal(res.status, 403);
  });

  it('rechaza URL pública inválida', async () => {
    const res = await agentFor('admin')
      .put('/api/config/notificaciones')
      .send({ frontend_url: 'ftp://malo' });
    assert.equal(res.status, 400);
  });
});
