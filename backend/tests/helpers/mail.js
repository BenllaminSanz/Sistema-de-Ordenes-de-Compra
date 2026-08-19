/**
 * Acceso a la bandeja mock del mailer (NODE_ENV=test).
 */
import {
  getSentMails,
  clearSentMails,
  isEmailMockEnabled,
  getConfigSource,
} from '../../src/config/mailer.js';

export { getSentMails, clearSentMails, isEmailMockEnabled, getConfigSource };

/** Busca mails cuyo subject o to contengan el texto (case-insensitive). */
export function findMails({ to, subjectIncludes } = {}) {
  return getSentMails().filter((m) => {
    if (to) {
      const dest = String(m.to || '').toLowerCase();
      const cc = String(m.cc || '').toLowerCase();
      const needle = String(to).toLowerCase();
      if (!dest.includes(needle) && !cc.includes(needle)) return false;
    }
    if (subjectIncludes) {
      const sub = String(m.subject || '').toLowerCase();
      if (!sub.includes(String(subjectIncludes).toLowerCase())) return false;
    }
    return true;
  });
}

/** Espera breve a notificaciones fire-and-forget (.catch en controllers). */
export async function flushAsyncMail(ms = 30) {
  await new Promise((r) => setTimeout(r, ms));
}
