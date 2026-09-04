import { it } from 'node:test';
import assert from 'node:assert/strict';
import { describeIntegration } from '../helpers/integration.js';
import { agentFor, USERS } from '../helpers/auth.js';
import { createRequerimiento, patchEstado } from '../helpers/factories.js';
import { query } from '../helpers/db.js';
import { ejecutarPurgaBorradores } from '../../src/utils/purgaBorradores.js';
import { importarBaseRequerimientos } from '../../src/utils/importBaseReq.js';

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

  it('el 1 de septiembre cancela julio con N° (en revisión e incompleto), borra borrador y deja agosto', async () => {
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
    assert.ok(r.borrados >= 1, JSON.stringify(r));
    assert.ok(r.cancelados >= 2, JSON.stringify(r));
    assert.ok(r.ids.includes(julBorr.body.id));
    assert.ok(r.ids.includes(julInc.id));
    assert.ok(r.ids.includes(julRev.body.id));
    assert.ok(!r.ids.includes(agoBorr.body.id));
    assert.ok(!r.ids.includes(julRec.body.id));

    const goneBorr = await agentFor('sol1').get(`/api/requerimientos/${julBorr.body.id}`);
    assert.equal(goneBorr.status, 404);

    const keepInc = await agentFor('sol1').get(`/api/requerimientos/${julInc.id}`);
    assert.equal(keepInc.status, 200);
    assert.equal(keepInc.body.estado, 'rechazado');
    assert.ok(keepInc.body.consecutivo);
    assert.ok((keepInc.body.historial || []).some((h) => h.estado_nuevo === 'rechazado'));
    const [[hist]] = await query(
      `SELECT cambiado_por FROM historial_estados
       WHERE entidad_tipo = 'requerimiento' AND entidad_id = ? AND estado_nuevo = 'rechazado'
       ORDER BY id DESC LIMIT 1`,
      [julInc.id]
    );
    assert.ok(hist?.cambiado_por, 'cambiado_por no puede ser null (el servidor lo exige)');
    assert.equal(Number(hist.cambiado_por), USERS.admin.id);

    const keepRev = await agentFor('compras').get(`/api/requerimientos/${julRev.body.id}`);
    assert.equal(keepRev.status, 200);
    assert.equal(keepRev.body.estado, 'rechazado');
    assert.ok(keepRev.body.consecutivo);

    const keepAgo = await agentFor('sol1').get(`/api/requerimientos/${agoBorr.body.id}`);
    assert.equal(keepAgo.status, 200);
    const keepRec = await agentFor('compras').get(`/api/requerimientos/${julRec.body.id}`);
    assert.equal(keepRec.status, 200);
    assert.equal(keepRec.body.estado, 'recibido');
  });

  it('reimportar Excel no recrea ni reabre un N° cancelado por la purga', async () => {
    const created = await createRequerimiento('sol1', { titulo_solicitud: 'Julio a cancelar' });
    assert.equal(created.status, 201);
    const env = await patchEstado('sol1', created.body.id, 'en_revision');
    assert.equal(env.status, 200, JSON.stringify(env.body));
    const consecutivo = env.body.consecutivo;
    assert.ok(consecutivo);
    await envejecer(created.body.id, '2026-07-10 12:00:00');

    const r = await ejecutarPurgaBorradores({ forzar: true, hoy: '2026-09-01' });
    assert.ok(r.cancelados >= 1, JSON.stringify(r));
    assert.ok(r.idsCancelados.includes(created.body.id));

    const after = await agentFor('sol1').get(`/api/requerimientos/${created.body.id}`);
    assert.equal(after.status, 200);
    assert.equal(after.body.estado, 'rechazado');

    const reporte = await importarBaseRequerimientos({
      actorUserId: USERS.admin.id,
      filas: [{
        consecutivo,
        titulo: 'Reimportado desde Excel',
        descripcion: 'Reimportado desde Excel',
        status_texto: 'En revision',
        reqEstado: 'en_revision',
        crearOc: false,
        tipo: 'PARTES',
        area: 'ADMINISTRACIÓN',
        departamento: 'MATERIAL DE OFICINA-55500',
        usuario: 'Solicitante Uno',
      }],
    });
    assert.equal(reporte.ok, true, JSON.stringify(reporte));
    assert.equal(reporte.importados, 0, JSON.stringify(reporte));
    assert.equal(reporte.actualizados, 1, JSON.stringify(reporte));

    const keep = await agentFor('sol1').get(`/api/requerimientos/${created.body.id}`);
    assert.equal(keep.status, 200);
    assert.equal(keep.body.estado, 'rechazado');
    assert.equal(keep.body.consecutivo, consecutivo);

    const [rows] = await query(
      'SELECT COUNT(*) AS n FROM requerimientos WHERE consecutivo = ?',
      [consecutivo]
    );
    assert.equal(Number(rows[0].n), 1);
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

  it('purga forzada registra cambiado_por del Admin (NOT NULL en el servidor)', async () => {
    const created = await createRequerimiento('sol1', { titulo_solicitud: 'Historial actor' });
    const env = await patchEstado('sol1', created.body.id, 'en_revision');
    assert.equal(env.status, 200, JSON.stringify(env.body));
    await envejecer(created.body.id, '2026-07-01 12:00:00');

    const r = await ejecutarPurgaBorradores({
      forzar: true,
      hoy: '2026-09-01',
      actorUserId: USERS.admin.id,
    });
    assert.ok(r.cancelados >= 1, JSON.stringify(r));

    const [[hist]] = await query(
      `SELECT cambiado_por FROM historial_estados
       WHERE entidad_tipo = 'requerimiento' AND entidad_id = ? AND estado_nuevo = 'rechazado'
       ORDER BY id DESC LIMIT 1`,
      [created.body.id]
    );
    assert.equal(Number(hist?.cambiado_por), USERS.admin.id);
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
