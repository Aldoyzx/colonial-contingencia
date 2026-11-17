import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Cifrado AES-256-GCM para guardar el secreto de MFA: si alguien lee la base, no obtiene el secreto. */
const keyFrom = (secret) => createHash('sha256').update(`mfa:${secret}`).digest();

export function encrypt(plain, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

/** El dato no se puede descifrar: formato desconocido o cifrado con otra clave (APP_SECRET cambió). */
export class DecryptionError extends Error {}

export function decrypt(payload, secret) {
  const [version, iv, tag, data] = String(payload).split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new DecryptionError('Formato de cifrado desconocido');
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch (cause) {
    throw new DecryptionError('No se pudo descifrar: la clave no coincide o el dato fue alterado', { cause });
  }
}
