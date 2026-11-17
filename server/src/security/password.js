import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

// Parámetros de scrypt (OWASP Password Storage Cheat Sheet): N = 2^15, r = 8, p = 1.
const PARAMS = Object.freeze({ N: 32768, r: 8, p: 1, keyLength: 64 });
const MAX_MEMORY = 64 * 1024 * 1024;

export const PASSWORD_RULES = Object.freeze({ minLength: 10, maxLength: 128 });

/**
 * Deriva el hash de una contraseña. Formato: scrypt$N$r$p$salBase64$hashBase64.
 * @param {Buffer} [salt] Solo para datos de demostración reproducibles; en uso normal se genera al azar.
 */
export async function hashPassword(plain, salt = randomBytes(16)) {
  const { N, r, p, keyLength } = PARAMS;
  const hash = await scrypt(plain.normalize('NFKC'), salt, keyLength, { N, r, p, maxmem: MAX_MEMORY });
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

/** Comparación en tiempo constante; devuelve false ante cualquier formato inválido. */
export async function verifyPassword(plain, stored) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(plain.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: MAX_MEMORY,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Devuelve la lista de reglas incumplidas (vacía si la contraseña es aceptable). */
export function passwordProblems(plain) {
  const problems = [];
  if (plain.length < PASSWORD_RULES.minLength) problems.push(`al menos ${PASSWORD_RULES.minLength} caracteres`);
  if (plain.length > PASSWORD_RULES.maxLength) problems.push(`como máximo ${PASSWORD_RULES.maxLength} caracteres`);
  if (!/[a-záéíóúñ]/.test(plain)) problems.push('una minúscula');
  if (!/[A-ZÁÉÍÓÚÑ]/.test(plain)) problems.push('una mayúscula');
  if (!/[0-9]/.test(plain)) problems.push('un número');
  return problems;
}
