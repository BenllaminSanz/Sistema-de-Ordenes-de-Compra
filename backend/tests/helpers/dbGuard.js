/**
 * Protección para tests de integración: no operar sobre BD de producción.
 * (Usado en Fase 2; disponible desde Fase 0.)
 */
export function assertTestDatabase(dbName = process.env.DB_NAME) {
  const name = String(dbName || '').trim();
  if (!name) {
    throw new Error('DB_NAME no definida. Configure backend/tests/.env.test');
  }
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${name}". ` +
      'DB_NAME must end with "_test" (e.g. ordenes_compra_test).'
    );
  }
  return name;
}
