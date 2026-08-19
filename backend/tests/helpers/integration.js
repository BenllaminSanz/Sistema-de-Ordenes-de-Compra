/**
 * Bootstrap compartido para archivos de integración.
 */
import { before, beforeEach, describe } from 'node:test';
import { prepareTestDatabase, resetFlowTables } from './db.js';
import { ensureApp } from './app.js';
import { clearSentMails } from './mail.js';

/**
 * describe con hooks de BD:
 * - schema/seed una vez por proceso
 * - truncate de flujo + bandeja email mock en cada test
 * - app Express en memoria
 */
export function describeIntegration(name, fn) {
  describe(name, () => {
    before(async () => {
      await prepareTestDatabase();
      await ensureApp();
    });

    beforeEach(async () => {
      await resetFlowTables();
      clearSentMails();
    });

    fn();
  });
}
