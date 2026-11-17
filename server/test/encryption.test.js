import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decrypt, DecryptionError, encrypt } from '../src/security/encryption.js';

test('AES-GCM: descifra con la misma clave', () => {
  assert.equal(decrypt(encrypt('JBSWY3DPEHPK3PXP', 'clave-a'), 'clave-a'), 'JBSWY3DPEHPK3PXP');
});

test('AES-GCM: otra clave o dato alterado lanza DecryptionError (no un error genérico)', () => {
  const payload = encrypt('JBSWY3DPEHPK3PXP', 'clave-a');
  assert.throws(() => decrypt(payload, 'clave-b'), DecryptionError);
  assert.throws(() => decrypt(`${payload.slice(0, -2)}AA`, 'clave-a'), DecryptionError);
  assert.throws(() => decrypt('v9.x.y.z', 'clave-a'), DecryptionError);
});
