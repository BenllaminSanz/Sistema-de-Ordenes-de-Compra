import { test, expect } from '@playwright/test';
import {
  USERS,
  resetE2eDb,
  login,
  apiLogin,
  apiCrearReqCatalogo,
} from './helpers.js';

test.describe('E03 — consulta de REQ ajeno (solo lectura)', () => {
  test.beforeEach(async () => {
    await resetE2eDb();
  });

  test('sol2 ve el detalle de un REQ de sol1 pero no puede editarlo', async ({ page, request }) => {
    const tokenSol1 = await apiLogin(request, USERS.sol1.email);
    const req = await apiCrearReqCatalogo(request, tokenSol1, {
      titulo_solicitud: 'E2E REQ de consulta de sol1',
    });

    await login(page, USERS.sol2.email);
    await page.goto(`/requerimientos.html?id=${req.id}`);

    await expect(page.locator('#detalle-info')).toContainText(/E2E REQ de consulta de sol1/i);
    await expect(page.locator('#panel-acciones')).not.toContainText(/Editar/i);
    await expect(page.locator('#panel-acciones')).not.toContainText(/Enviar a revisión/i);
  });
});
