import { test, expect } from '@playwright/test';
import {
  USERS,
  resetE2eDb,
  login,
  apiLogin,
  apiCrearReqCatalogo,
  apiPatchEstado,
  confirmarCambioEstado,
} from './helpers.js';

test.describe('E02 — compras acusa, aprueba, genera OC, recibe y cierra', () => {
  test.beforeEach(async () => {
    await resetE2eDb();
  });

  test('acuse → aprobar → generar OC → recepción → cerrar', async ({ page, request }) => {
    const tokenSol = await apiLogin(request, USERS.sol1.email);
    const creado = await apiCrearReqCatalogo(request, tokenSol, {
      titulo_solicitud: 'E2E flujo OC sin cotización',
    });
    await apiPatchEstado(request, tokenSol, creado.id, 'en_revision');

    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await login(page, USERS.compras.email);
    await page.goto(`/requerimientos.html?id=${creado.id}`);
    await expect(page.locator('#detalle-info')).toContainText(/En revisión/);

    await confirmarCambioEstado(page, /Marcar como recibido/);
    await expect(page.locator('#detalle-info')).toContainText(/Recibido/);

    await confirmarCambioEstado(page, /^Aprobar$/);
    await expect(page.locator('#detalle-info')).toContainText(/Aprobado/);

    await page.getByRole('button', { name: /Generar OC/ }).click();
    await expect(page.locator('#modal-po-generar-oc')).toHaveClass(/show/);
    const radioNo = page.locator('#modal-po-generar-oc input[name="po-oc-tiene"][value="no"]');
    if (await radioNo.count()) await radioNo.check();
    const fecha = page.locator('#po-oc-fecha');
    if (!(await fecha.inputValue())) {
      await fecha.fill(new Date().toISOString().slice(0, 10));
    }
    await page.locator('#btn-confirmar-po-generar-oc').click();
    await expect(page.locator('#detalle-info')).toContainText(/Cerrado/, { timeout: 20_000 });

    await page.goto('/ordenes.html');
    await page.locator('button[data-action="ver-oc"]').first().click();
    await expect(page.locator('#detalle-info')).toContainText(/Generada/);

    await page.getByRole('button', { name: /^Distribuir$/ }).click();
    await expect(page.locator('#modal-recepcion')).toHaveClass(/show/, { timeout: 20_000 });
    await page.locator('#btn-guardar-recepcion').click();

    await expect(page.locator('#detalle-info')).toContainText(/cerrada/i, { timeout: 20_000 });
  });
});
