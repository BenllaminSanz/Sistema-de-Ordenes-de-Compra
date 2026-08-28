import { test, expect } from '@playwright/test';
import {
  USERS,
  AREA_DEPT,
  resetE2eDb,
  login,
  logout,
} from './helpers.js';

test.describe('E01 — solicitante crea REQ de catálogo y envía a revisión', () => {
  test.beforeEach(async () => {
    await resetE2eDb();
  });

  test('login → crear REQ catálogo → enviar a revisión → logout', async ({ page }) => {
    await login(page, USERS.sol1.email);
    await expect(page.locator('#dash-titulo')).toContainText(/Dashboard/i);

    await page.goto('/requerimientos.html');
    await page.getByRole('button', { name: /Nuevo requerimiento/ }).click();
    await expect(page.locator('#modal-req')).toHaveClass(/show/);

    await page.locator('#req-titulo').fill('E2E tornillos M8 de catálogo');
    await page.locator('#req-tipo').selectOption('PARTES');
    await page.locator('#req-area').selectOption(AREA_DEPT.area);
    await page.locator('#req-departamento').selectOption(AREA_DEPT.departamento);

    await page.locator('#busqueda-catalogo').fill('P-ALPHA-001');
    await page.locator('#modal-req').getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.locator('#resultados-catalogo').getByRole('button', { name: /^\+?\s*Agregar$/ }).first().click();
    await expect(page.locator('#items-seleccionados-req')).toContainText(/P-ALPHA-001|Tornillo/i);

    await page.locator('#btn-guardar-req').click();
    await expect(page.locator('#vista-detalle')).toBeVisible();
    await expect(page.locator('#detalle-info')).toContainText(/Borrador/);

    await confirmarEnviarRevision(page);
    await expect(page.locator('#detalle-info')).toContainText(/En revisión/);

    await logout(page);
    await expect(page.locator('#form-login')).toBeVisible();
  });
});

async function confirmarEnviarRevision(page) {
  await page.getByRole('button', { name: /Enviar a revisión/ }).click();
  await expect(page.locator('#modal-estado')).toHaveClass(/show/);
  await page.locator('#btn-confirmar-estado').click();
  await expect(page.locator('#modal-estado')).not.toHaveClass(/show/);
}
