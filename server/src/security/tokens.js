import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Tokens firmados con HMAC-SHA256 en formato JWT (RFC 7519, algoritmo HS256).
 * Se implementan con node:crypto para no depender de una librería externa; solo
 * se acepta HS256, lo que evita el ataque de "alg: none".
 */
const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

const signPart = (data, secret) => createHmac('sha256', secret).update(data).digest('base64url');

export function signToken(payload, secret, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds })).toString('base64url');
  const data = `${HEADER}.${body}`;
  return `${data}.${signPart(data, secret)}`;
}

/** Devuelve el contenido si la firma es válida, no expiró y es del tipo esperado; si no, null. */
export function verifyToken(token, secret, expectedType) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) return null;
  const expected = Buffer.from(signPart(`${parts[0]}.${parts[1]}`, secret));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (expectedType && payload.typ !== expectedType) return null;
    return payload;
  } catch {
    return null;
  }
}
