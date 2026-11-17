import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

// scrypt según OWASP Password Storage Cheat Sheet: N = 2^15, r = 8, p = 3 es una de sus
// configuraciones equivalentes al mínimo (N = 2^17, p = 1) que usa 32 MiB en vez de 128 MiB,
// adecuada para servidores pequeños como el plan gratuito de la nube.
const PARAMS = Object.freeze({ N: 32768, r: 8, p: 3, keyLength: 64 });
const MAX_MEMORY = 64 * 1024 * 1024;

// Política alineada con NIST SP 800-63B-4: longitud y lista de contraseñas prohibidas, sin
// exigir mezclas de mayúsculas, números y símbolos (que llevan a patrones predecibles).
export const PASSWORD_RULES = Object.freeze({ minLength: 12, maxLength: 128 });

/** Contraseñas comunes y palabras del contexto que un atacante probaría primero. */
const BLOCKED_FRAGMENTS = Object.freeze(['colonial', 'contingencia', 'pipeline', 'darkside', 'password', 'contraseña', 'qwerty', '123456', 'abcdef', 'admin']);

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
export function passwordProblems(plain, { email = '' } = {}) {
  const problems = [];
  const lower = plain.toLowerCase();
  if (plain.length < PASSWORD_RULES.minLength) problems.push(`al menos ${PASSWORD_RULES.minLength} caracteres`);
  if (plain.length > PASSWORD_RULES.maxLength) problems.push(`como máximo ${PASSWORD_RULES.maxLength} caracteres`);
  const fragment = BLOCKED_FRAGMENTS.find((f) => lower.includes(f));
  if (fragment) problems.push(`no contener palabras previsibles como "${fragment}"`);
  const localPart = email.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) problems.push('no contener tu usuario');
  if (/^(.)\1+$/.test(plain)) problems.push('no repetir un mismo carácter');
  return problems;
}
