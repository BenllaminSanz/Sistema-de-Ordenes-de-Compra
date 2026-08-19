import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  enviarCorreo,
  getSentMails,
  clearSentMails,
  isEmailMockEnabled,
  getConfigSource,
} from '../../../src/config/mailer.js';

describe('config/mailer — mock en test', () => {
  beforeEach(() => {
    clearSentMails();
  });

  it('está en modo mock bajo NODE_ENV=test', () => {
    assert.equal(isEmailMockEnabled(), true);
    assert.equal(getConfigSource(), 'mock');
  });

  it('enviarCorreo registra en bandeja sin red', async () => {
    const r = await enviarCorreo({
      to: 'dest@test.local',
      subject: 'Hola mock',
      html: '<p>hola</p>',
      text: 'hola',
    });
    assert.equal(r.success, true);
    assert.match(r.messageId || '', /mock-/);

    const mails = getSentMails();
    assert.equal(mails.length, 1);
    assert.equal(mails[0].to, 'dest@test.local');
    assert.equal(mails[0].subject, 'Hola mock');
  });

  it('clearSentMails vacía la bandeja', async () => {
    await enviarCorreo({ to: 'a@b.c', subject: 'x', html: 'y' });
    assert.equal(getSentMails().length, 1);
    clearSentMails();
    assert.equal(getSentMails().length, 0);
  });
});
