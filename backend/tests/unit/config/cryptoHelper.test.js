import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt } from '../../../src/config/cryptoHelper.js';

describe('config/cryptoHelper', () => {
  it('roundtrip encrypt → decrypt', () => {
    const plain = 'MiPasswordSMTP!123';
    const cipher = encrypt(plain);
    assert.notEqual(cipher, plain);
    assert.match(cipher, /^[0-9a-f]+:[0-9a-f]+$/i);
    assert.equal(decrypt(cipher), plain);
  });

  it('mismo texto produce cifrados distintos (IV aleatorio)', () => {
    const a = encrypt('mismo');
    const b = encrypt('mismo');
    assert.notEqual(a, b);
    assert.equal(decrypt(a), 'mismo');
    assert.equal(decrypt(b), 'mismo');
  });

  it('falla si falta SECRET_ENCRYPTION_KEY', () => {
    const prev = process.env.SECRET_ENCRYPTION_KEY;
    try {
      delete process.env.SECRET_ENCRYPTION_KEY;
      assert.throws(() => encrypt('x'), /SECRET_ENCRYPTION_KEY/);
    } finally {
      process.env.SECRET_ENCRYPTION_KEY = prev;
    }
  });

  it('falla si la clave no tiene 32 bytes', () => {
    const prev = process.env.SECRET_ENCRYPTION_KEY;
    try {
      process.env.SECRET_ENCRYPTION_KEY = 'corta';
      assert.throws(() => encrypt('x'), /32 bytes/);
    } finally {
      process.env.SECRET_ENCRYPTION_KEY = prev;
    }
  });
});
