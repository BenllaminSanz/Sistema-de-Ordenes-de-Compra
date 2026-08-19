import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertTestDatabase } from '../../helpers/dbGuard.js';

describe('helpers/dbGuard — assertTestDatabase', () => {
  it('acepta nombres que terminan en _test', () => {
    assert.equal(assertTestDatabase('ordenes_compra_test'), 'ordenes_compra_test');
    assert.equal(assertTestDatabase('foo_test'), 'foo_test');
  });

  it('rechaza BD de producción o desarrollo', () => {
    assert.throws(() => assertTestDatabase('ordenes_compra'), /_test/);
    assert.throws(() => assertTestDatabase('produccion'), /_test/);
  });

  it('rechaza nombre vacío', () => {
    assert.throws(() => assertTestDatabase(''), /DB_NAME/);
    assert.throws(() => assertTestDatabase(null), /DB_NAME/);
  });
});
