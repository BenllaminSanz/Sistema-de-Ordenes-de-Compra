import { it } from 'node:test';
import assert from 'node:assert/strict';
import { describeIntegration } from '../helpers/integration.js';
import { agentFor } from '../helpers/auth.js';
import { query } from '../helpers/db.js';
import { isEmailMockEnabled } from '../helpers/mail.js';

describeIntegration('Configuración SMTP', () => {
  it('S02 — compras no accede a GET /api/config/smtp', async () => {
    const res = await agentFor('compras').get('/api/config/smtp');
    assert.equal(res.status, 403);
  });

  it('solicitante no accede a SMTP', async () => {
    const res = await agentFor('sol1').get('/api/config/smtp');
    assert.equal(res.status, 403);
  });

  it('anónimo → 401', async () => {
    const { getApp } = await import('../helpers/app.js');
    const request = (await import('supertest')).default;
    const res = await request(getApp()).get('/api/config/smtp');
    assert.equal(res.status, 401);
  });

  it('admin GET sin config en DB → usando_env', async () => {
    const res = await agentFor('admin').get('/api/config/smtp');
    assert.equal(res.status, 200);
    assert.equal(res.body.usando_env, true);
    assert.equal(res.body.config, null);
  });

  it('S03 — admin guarda SMTP y GET no expone password en claro', async () => {
    const put = await agentFor('admin').put('/api/config/smtp').send({
      host: 'smtp.test.local',
      port: 587,
      secure: false,
      user: 'smtp-user@test.local',
      pass: 'SuperSecretPass123!',
      from_name: 'OC Test',
      cc_cotizaciones: 'cc@test.local',
    });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.ok(put.body.config);

    const cfg = put.body.config;
    // No debe venir pass plano ni pass_encrypted
    assert.equal(cfg.pass, undefined);
    assert.equal(cfg.pass_encrypted, undefined);
    assert.equal(cfg.tiene_password, true);
    assert.ok(cfg.pass_masked);
    assert.ok(!String(cfg.pass_masked).includes('SuperSecret'));
    assert.equal(cfg.host, 'smtp.test.local');
    assert.equal(cfg.user, 'smtp-user@test.local');

    const get = await agentFor('admin').get('/api/config/smtp');
    assert.equal(get.status, 200);
    assert.equal(get.body.usando_env, false);
    assert.equal(get.body.config.pass, undefined);
    assert.equal(get.body.config.pass_encrypted, undefined);
    assert.equal(get.body.config.tiene_password, true);

    // En BD la contraseña está cifrada (no texto plano)
    const [[row]] = await query(
      'SELECT pass_encrypted FROM configuracion_smtp WHERE activo = 1 LIMIT 1'
    );
    assert.ok(row.pass_encrypted);
    assert.notEqual(row.pass_encrypted, 'SuperSecretPass123!');
    assert.match(row.pass_encrypted, /:/); // formato iv:cipher de cryptoHelper
  });

  it('compras no puede PUT smtp', async () => {
    const res = await agentFor('compras').put('/api/config/smtp').send({
      host: 'evil.local',
      user: 'x@y.z',
    });
    assert.equal(res.status, 403);
  });

  it('admin puede resetear a .env (DELETE)', async () => {
    // Asegurar que hay config
    await agentFor('admin').put('/api/config/smtp').send({
      host: 'smtp.reset.local',
      user: 'reset@test.local',
      pass: 'TempPass99!',
    });

    const del = await agentFor('admin').delete('/api/config/smtp');
    assert.ok([200, 204].includes(del.status), JSON.stringify(del.body));

    const get = await agentFor('admin').get('/api/config/smtp');
    assert.equal(get.status, 200);
    assert.equal(get.body.usando_env, true);
  });

  it('mock de email sigue activo tras recargar transporter en test', async () => {
    assert.equal(isEmailMockEnabled(), true);
    // Guardar config no debe romper el mock (recargarTransporter en test re-aplica mock)
    await agentFor('admin').put('/api/config/smtp').send({
      host: 'smtp.mock.local',
      user: 'mock-reload@test.local',
      pass: 'x',
    });
    const { getConfigSource } = await import('../../src/config/mailer.js');
    assert.equal(getConfigSource(), 'mock');
  });
});
