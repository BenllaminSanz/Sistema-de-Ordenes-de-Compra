/**
 * Helpers E2E: login UI, API contra el servidor Playwright y reset de tablas de flujo.
 */
import '../setup-env.js';
import { expect } from '@playwright/test';
import { resetFlowTables } from '../helpers/db.js';

export const TEST_PASSWORD = 'Test1234!';

export const USERS = {
  admin: { email: 'admin@test.local', rol: 'admin' },
  compras: { email: 'compras@test.local', rol: 'compras' },
  sol1: { email: 'sol1@test.local', rol: 'solicitante' },
  sol2: { email: 'sol2@test.local', rol: 'solicitante' },
};

export const AREA_DEPT = {
  area: 'ADMINISTRACIÓN',
  departamento: 'MATERIAL DE OFICINA-55500',
};

export async function resetE2eDb() {
  await resetFlowTables();
}

export async function login(page, email, password = TEST_PASSWORD) {
  await page.goto('/login.html');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login.html');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#btn-login').click();
  await page.waitForURL(/dashboard\.html/);
  await expect(page.locator('.badge-rol')).toBeVisible();
}

export async function logout(page) {
  await page.locator('.btn-logout').click();
  await page.waitForURL(/login\.html/);
}

export async function apiLogin(request, email, password = TEST_PASSWORD) {
  const res = await request.post('/api/auth/login', {
    data: { email, password },
  });
  const body = await res.json();
  if (!res.ok()) {
    throw new Error(`login ${email} → ${res.status()} ${JSON.stringify(body)}`);
  }
  return body.token;
}

export async function apiJson(request, method, path, { token, data } = {}) {
  const res = await request[method](path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok()) {
    throw new Error(`${method.toUpperCase()} ${path} → ${res.status()} ${JSON.stringify(body)}`);
  }
  return body;
}

/** REQ de catálogo con precio (no requiere cotización) en borrador. */
export async function apiCrearReqCatalogo(request, token, overrides = {}) {
  return apiJson(request, 'post', '/api/requerimientos', {
    token,
    data: {
      titulo_solicitud: overrides.titulo_solicitud || 'E2E REQ catálogo con precio',
      tipo: overrides.tipo || 'PARTES',
      area: overrides.area || AREA_DEPT.area,
      departamento: overrides.departamento || AREA_DEPT.departamento,
      notas: overrides.notas || 'Creado por E2E',
      items: overrides.items || [{ catalogo_id: 1, cantidad: 2 }],
    },
  });
}

export async function apiPatchEstado(request, token, reqId, estado, notas) {
  const data = { estado };
  if (notas !== undefined) data.notas = notas;
  return apiJson(request, 'patch', `/api/requerimientos/${reqId}/estado`, { token, data });
}

export async function confirmarCambioEstado(page, botonNombre) {
  await page.getByRole('button', { name: botonNombre }).click();
  await expect(page.locator('#modal-estado')).toHaveClass(/show/);
  await page.locator('#btn-confirmar-estado').click();
  await expect(page.locator('#modal-estado')).not.toHaveClass(/show/);
}
