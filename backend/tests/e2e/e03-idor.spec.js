import { test, expect } from '@playwright/test';
import {
  USERS,
  resetE2eDb,
  login,
  apiLogin,
  apiCrearReqCatalogo,
} from './helpers.js';

test.describe('E03 — solicitante no ve REQ ajeno', () => {
  test.beforeEach(async () => {
    await resetE2eDb();
  });

  test('sol2 no carga el detalle de un REQ de sol1', async ({ page, request }) => {
    const tokenSol1 = await apiLogin(request, USERS.sol1.email);
    const req = await apiCrearReqCatalogo(request, tokenSol1, {
      titulo_solicitud: 'E2E REQ privado de sol1',
    });

    await login(page, USERS.sol2.email);
    await page.goto(`/requerimientos.html?id=${req.id}`);

    await expect(page.locator('#detalle-info')).toContainText(/No se pudo cargar el requerimiento/i);

    await page.getByRole('button', { name: /Volver a la lista/ }).click();
    await expect(page.locator('#vista-lista')).toBeVisible();
    await expect(page.locator('#tabla-reqs')).not.toContainText(/E2E REQ privado de sol1/);
  });
});
