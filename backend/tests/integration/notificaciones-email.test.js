import { it } from 'node:test';
import assert from 'node:assert/strict';
import { describeIntegration } from '../helpers/integration.js';
import {
  createRequerimiento,
  patchEstado,
} from '../helpers/factories.js';
import {
  getSentMails,
  findMails,
  flushAsyncMail,
  isEmailMockEnabled,
} from '../helpers/mail.js';

describeIntegration('Notificaciones por correo', () => {
  it('mock de email activo en tests', () => {
    assert.equal(isEmailMockEnabled(), true);
  });

  it('al enviar REQ a en_revision se notifica a Compras/Admin', async () => {
    const created = await createRequerimiento('sol1', {
      titulo_solicitud: 'REQ para notificar bandeja de compras',
      items: [{ catalogo_id: 1, cantidad: 1 }],
    });
    assert.equal(created.status, 201);

    const res = await patchEstado('sol1', created.body.id, 'en_revision');
    assert.equal(res.status, 200, JSON.stringify(res.body));

    // notificarComprasReqEnRevision se dispara en background (.catch)
    await flushAsyncMail(80);

    const mails = getSentMails();
    assert.ok(mails.length >= 1, `esperaba al menos 1 mail, got ${mails.length}: ${JSON.stringify(mails)}`);

    const notif = findMails({ subjectIncludes: 'revisión' });
    assert.ok(notif.length >= 1, `subject revisión no encontrado: ${JSON.stringify(mails.map(m => m.subject))}`);

    // Destinatarios seed: admin@test.local y compras@test.local
    const blob = JSON.stringify(notif[0]).toLowerCase();
    assert.ok(
      blob.includes('admin@test.local') || blob.includes('compras@test.local'),
      `destinos inesperados: ${blob}`
    );
    assert.match(notif[0].subject || '', /REQ|revisión|revision/i);
  });

  it('no notifica si el estado no cambia a en_revision desde otro (idempotente re-entrada)', async () => {
    const created = await createRequerimiento('sol1');
    await patchEstado('sol1', created.body.id, 'en_revision');
    await flushAsyncMail(50);
    const afterFirst = getSentMails().length;

    // incompleto → en_revision (compras puede; solicitante desde incompleto también)
    await patchEstado('compras', created.body.id, 'recibido');
    await patchEstado('compras', created.body.id, 'incompleto', 'faltan datos');
    // limpiar mails previos al reenvío
    const { clearSentMails } = await import('../helpers/mail.js');
    clearSentMails();

    const again = await patchEstado('sol1', created.body.id, 'en_revision');
    assert.equal(again.status, 200);
    await flushAsyncMail(80);

    const reenvio = findMails({ subjectIncludes: 'revisión' });
    assert.ok(reenvio.length >= 1, 'debe volver a notificar al reentrar a en_revision');
    assert.ok(afterFirst >= 1);
  });
});
