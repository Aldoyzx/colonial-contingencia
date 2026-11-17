import QRCode from 'qrcode';
import { BusinessRuleError, UnauthorizedError, ValidationError } from '../domain/errors.js';
import { decrypt, encrypt } from '../security/encryption.js';
import { hashPassword, passwordProblems, verifyPassword } from '../security/password.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../security/totp.js';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
const ISSUER = 'Centro de Contingencia';
const GENERIC_LOGIN_ERROR = 'Correo o contraseña incorrectos';

/** Datos públicos del usuario (nunca el hash ni el secreto de MFA). */
const PUBLIC_COLUMNS = 'id, nombre, email, rol, mfa_activo, ultimo_acceso';

// Hash de relleno: con un correo inexistente también se ejecuta scrypt, así el tiempo
// de respuesta no revela qué cuentas existen.
let dummyHashPromise = null;
const dummyHash = () => (dummyHashPromise ??= hashPassword('relleno-para-tiempo-constante'));

export async function recordSecurityEvent(db, { usuarioId = null, email = null, evento, detalle = null }, ctx = {}) {
  await db.run(
    `INSERT INTO eventos_seguridad (usuario_id, email_intentado, evento, ip, agente, detalle)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [usuarioId, email, evento, ctx.ip?.slice(0, 45) ?? null, ctx.userAgent?.slice(0, 300) ?? null, detalle]
  );
}

export function getPublicUser(db, userId) {
  return db.one(`SELECT ${PUBLIC_COLUMNS} FROM usuarios WHERE id = $1 AND activo`, [userId]);
}

async function registerFailure(db, user, ctx, evento = 'login_fallido') {
  const attempts = user.intentos_fallidos + 1;
  const locked = attempts >= MAX_FAILED_ATTEMPTS;
  await db.run(
    `UPDATE usuarios SET intentos_fallidos = $1,
            bloqueado_hasta = CASE WHEN $2 THEN now() + make_interval(mins => $3) ELSE bloqueado_hasta END
      WHERE id = $4`,
    [locked ? 0 : attempts, locked, LOCK_MINUTES, user.id]
  );
  await recordSecurityEvent(db, { usuarioId: user.id, email: user.email, evento, detalle: `Intento ${attempts} de ${MAX_FAILED_ATTEMPTS}` }, ctx);
  if (locked) {
    await recordSecurityEvent(db, { usuarioId: user.id, email: user.email, evento: 'cuenta_bloqueada', detalle: `Bloqueada ${LOCK_MINUTES} min` }, ctx);
  }
}

function assertNotLocked(user) {
  if (user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date()) {
    const minutes = Math.ceil((new Date(user.bloqueado_hasta) - new Date()) / 60000);
    throw new UnauthorizedError(`Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en ${minutes} min`);
  }
}

async function markSuccess(db, user, ctx) {
  await db.run('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = now() WHERE id = $1', [user.id]);
  await recordSecurityEvent(db, { usuarioId: user.id, email: user.email, evento: 'login_exitoso', detalle: user.mfa_activo ? 'Con MFA' : 'Sin MFA' }, ctx);
}

/**
 * Primer factor. Si el usuario tiene MFA, no inicia sesión: el llamador emite un desafío
 * y espera el código. El mismo mensaje de error para correo o contraseña incorrectos
 * evita revelar qué cuentas existen.
 */
export function authenticatePassword(db, { email, clave }, ctx) {
  return db.tx(async (tx) => {
    const user = await tx.one('SELECT * FROM usuarios WHERE email = $1 AND activo FOR UPDATE', [email.toLowerCase()]);
    if (!user) {
      await verifyPassword(clave, await dummyHash());
      await recordSecurityEvent(tx, { email, evento: 'login_fallido', detalle: 'Cuenta inexistente' }, ctx);
      throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
    }
    assertNotLocked(user);
    if (!(await verifyPassword(clave, user.clave_hash))) {
      await registerFailure(tx, user, ctx);
      return { ok: false };
    }
    if (user.mfa_activo) return { ok: true, mfaRequerido: true, userId: user.id };
    await markSuccess(tx, user, ctx);
    return { ok: true, mfaRequerido: false, userId: user.id };
  }).then((result) => {
    // El fallo se confirma en la base antes de responder con error.
    if (!result.ok) throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
    return result;
  });
}

/** Segundo factor: código TOTP de la app autenticadora. */
export function authenticateMfa(db, userId, codigo, ctx, secret) {
  return db.tx(async (tx) => {
    const user = await tx.one('SELECT * FROM usuarios WHERE id = $1 AND activo FOR UPDATE', [userId]);
    if (!user || !user.mfa_activo) throw new UnauthorizedError('Desafío MFA inválido');
    assertNotLocked(user);
    if (!verifyTotp(decrypt(user.mfa_secreto_cifrado, secret), codigo)) {
      await registerFailure(tx, user, ctx, 'mfa_fallido');
      return { ok: false };
    }
    await markSuccess(tx, user, ctx);
    return { ok: true };
  }).then((result) => {
    if (!result.ok) throw new UnauthorizedError('Código de verificación incorrecto');
  });
}

/** Paso 1 de la activación: genera el secreto (aún inactivo) y el QR para escanearlo. */
export async function startMfaEnrollment(db, user, secret) {
  if (user.mfa_activo) throw new BusinessRuleError('MFA ya está activo en esta cuenta');
  const totpSecret = generateTotpSecret();
  await db.run('UPDATE usuarios SET mfa_secreto_cifrado = $1 WHERE id = $2', [encrypt(totpSecret, secret), user.id]);
  const url = otpauthUrl({ issuer: ISSUER, account: user.email, secret: totpSecret });
  return { secreto: totpSecret, otpauthUrl: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
}

/** Paso 2: el usuario demuestra que su app genera códigos válidos y MFA queda activo. */
export function confirmMfaEnrollment(db, user, codigo, ctx, secret) {
  return db.tx(async (tx) => {
    const row = await tx.one('SELECT mfa_activo, mfa_secreto_cifrado FROM usuarios WHERE id = $1 FOR UPDATE', [user.id]);
    if (row.mfa_activo) throw new BusinessRuleError('MFA ya está activo en esta cuenta');
    if (!row.mfa_secreto_cifrado) throw new BusinessRuleError('Primero genera el código QR');
    if (!verifyTotp(decrypt(row.mfa_secreto_cifrado, secret), codigo)) {
      throw new ValidationError('codigo: el código no coincide; revisa que la hora del teléfono sea correcta');
    }
    await tx.run('UPDATE usuarios SET mfa_activo = TRUE WHERE id = $1', [user.id]);
    await recordSecurityEvent(tx, { usuarioId: user.id, email: user.email, evento: 'mfa_activado' }, ctx);
    return getPublicUser(tx, user.id);
  });
}

/** Desactivar MFA exige contraseña y un código vigente (dos pruebas de identidad). */
export function disableMfa(db, user, { clave, codigo }, ctx, secret, mfaRequiredRoles) {
  return db.tx(async (tx) => {
    if (mfaRequiredRoles.includes(user.rol)) {
      throw new BusinessRuleError('Tu rol exige MFA; no se puede desactivar');
    }
    const row = await tx.one('SELECT * FROM usuarios WHERE id = $1 FOR UPDATE', [user.id]);
    if (!row.mfa_activo) throw new BusinessRuleError('MFA no está activo');
    const validPassword = await verifyPassword(clave, row.clave_hash);
    if (!validPassword || !verifyTotp(decrypt(row.mfa_secreto_cifrado, secret), codigo)) {
      throw new ValidationError('Contraseña o código incorrectos');
    }
    await tx.run('UPDATE usuarios SET mfa_activo = FALSE, mfa_secreto_cifrado = NULL WHERE id = $1', [user.id]);
    await recordSecurityEvent(tx, { usuarioId: user.id, email: user.email, evento: 'mfa_desactivado' }, ctx);
    return getPublicUser(tx, user.id);
  });
}

export function changePassword(db, user, { actual, nueva }, ctx) {
  return db.tx(async (tx) => {
    const row = await tx.one('SELECT clave_hash FROM usuarios WHERE id = $1 FOR UPDATE', [user.id]);
    if (!(await verifyPassword(actual, row.clave_hash))) {
      throw new ValidationError('actual: la contraseña actual no es correcta');
    }
    const problems = passwordProblems(nueva, { email: user.email });
    if (problems.length > 0) throw new ValidationError(`nueva: debe tener ${problems.join(', ')}`);
    if (actual === nueva) throw new ValidationError('nueva: debe ser distinta de la actual');
    await tx.run('UPDATE usuarios SET clave_hash = $1 WHERE id = $2', [await hashPassword(nueva), user.id]);
    await recordSecurityEvent(tx, { usuarioId: user.id, email: user.email, evento: 'cambio_clave' }, ctx);
  });
}

export function listSecurityEvents(db, { limit = 50 } = {}) {
  return db.many(
    `SELECT e.id, e.evento, e.email_intentado, e.ip, e.detalle, e.fecha, u.nombre AS usuario_nombre
       FROM eventos_seguridad e LEFT JOIN usuarios u ON u.id = e.usuario_id
      ORDER BY e.fecha DESC, e.id DESC LIMIT $1`,
    [limit]
  );
}
