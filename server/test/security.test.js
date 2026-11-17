import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FAILED_ATTEMPTS } from '../src/services/authService.js';
import { hashPassword, passwordProblems, verifyPassword } from '../src/security/password.js';
import { signToken, verifyToken } from '../src/security/tokens.js';
import { base32Encode, totpCode, verifyTotp } from '../src/security/totp.js';
import { decrypt, encrypt } from '../src/security/encryption.js';
import { setup } from './helpers.js';
import { EMAILS, startServer, testConfig } from './httpHelpers.js';

describe('Seguridad · primitivas criptográficas', () => {
  test('TOTP coincide con el vector de prueba de RFC 6238 (T = 59 s → 287082)', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    assert.equal(totpCode(secret, 59_000), '287082');
    assert.equal(totpCode(secret, 1_111_111_109_000), '081804');
    assert.ok(verifyTotp(secret, '287082', 59_000));
    assert.ok(verifyTotp(secret, '287082', 59_000 + 30_000), 'tolera un intervalo de desfase');
    assert.ok(!verifyTotp(secret, '287082', 59_000 + 120_000), 'rechaza códigos viejos');
  });

  test('scrypt: verifica la contraseña correcta y rechaza las demás', async () => {
    const stored = await hashPassword('Colonial2021!');
    assert.match(stored, /^scrypt\$32768\$8\$3\$/);
    assert.ok(await verifyPassword('Colonial2021!', stored));
    assert.ok(!(await verifyPassword('colonial2021!', stored)));
    assert.ok(!(await verifyPassword('x', 'formato-invalido')));
    assert.notEqual(stored, await hashPassword('Colonial2021!'), 'la sal aleatoria produce hashes distintos');
  });

  test('política de contraseñas (NIST SP 800-63B-4: longitud y lista de prohibidas)', () => {
    assert.deepEqual(passwordProblems('tren azul hacia linden'), [], 'una frase larga es válida sin símbolos');
    assert.ok(passwordProblems('corta').length >= 1);
    assert.ok(passwordProblems('Colonial2021!').some((p) => p.includes('colonial')), 'rechaza palabras del contexto');
    assert.ok(passwordProblems('mtorres-segura-2026', { email: 'mtorres@colonial.local' }).includes('no contener tu usuario'));
  });

  test('tokens firmados: rechazan firma alterada, tipo incorrecto y vencimiento', () => {
    const token = signToken({ typ: 'sesion', sub: 1 }, 'clave', 60);
    assert.equal(verifyToken(token, 'clave', 'sesion').sub, 1);
    assert.equal(verifyToken(token, 'otra-clave', 'sesion'), null);
    assert.equal(verifyToken(token, 'clave', 'mfa'), null);
    assert.equal(verifyToken(signToken({ typ: 'sesion', sub: 1 }, 'clave', -1), 'clave', 'sesion'), null);
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ typ: 'sesion', sub: 99, exp: 9e9 })).toString('base64url');
    assert.equal(verifyToken(`${h}.${forged}.${s}`, 'clave', 'sesion'), null);
  });

  test('el secreto de MFA se guarda cifrado con AES-256-GCM', () => {
    const payload = encrypt('JBSWY3DPEHPK3PXP', 'clave');
    assert.ok(!payload.includes('JBSWY3DPEHPK3PXP'));
    assert.equal(decrypt(payload, 'clave'), 'JBSWY3DPEHPK3PXP');
    assert.throws(() => decrypt(payload, 'otra-clave'));
  });
});

describe('Seguridad · autenticación, MFA y auditoría (HTTP)', () => {
  let srv;
  let db;

  before(async () => {
    ({ db } = await setup());
    srv = await startServer(db);
  });
  after(() => srv.close());

  test('inicio de sesión correcto emite una cookie httpOnly y SameSite=Strict', async () => {
    const c = srv.client();
    const res = await c.call('/auth/login', { method: 'POST', body: { email: EMAILS.analistaTi, clave: 'Colonial2021!' }, raw: true });
    assert.equal(res.status, 200);
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
  });

  test('el mismo mensaje para correo inexistente y contraseña incorrecta', async () => {
    const c = srv.client();
    const unknown = await c.login('nadie@colonial.local', 'Colonial2021!');
    const wrong = await c.login(EMAILS.comunicaciones, 'Incorrecta123');
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error.message, wrong.body.error.message);
  });

  test(`la cuenta se bloquea tras ${MAX_FAILED_ATTEMPTS} intentos fallidos y queda en la bitácora`, async () => {
    const c = srv.client();
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) await c.login(EMAILS.legal, `Mala${i}Clave`);
    const locked = await c.login(EMAILS.legal);
    assert.equal(locked.status, 401);
    assert.match(locked.body.error.message, /bloqueada/);
    const events = await db.many(`SELECT evento FROM eventos_seguridad WHERE email_intentado = $1`, [EMAILS.legal]);
    assert.ok(events.some((e) => e.evento === 'cuenta_bloqueada'));
    await assert.rejects(db.query('DELETE FROM eventos_seguridad'), { code: '23001' }, 'la bitácora de seguridad es inmutable');
  });

  test('sin la cabecera anti-CSRF, las modificaciones se rechazan', async () => {
    const c = srv.client();
    await c.login(EMAILS.coordinador);
    const res = await c.call('/incidentes', { method: 'POST', body: {}, csrf: false });
    assert.equal(res.status, 403);
  });

  test('activar MFA y luego iniciar sesión con contraseña + código', async () => {
    const c = srv.client();
    await c.login(EMAILS.operadorOt);
    const setupRes = await c.call('/auth/mfa/configurar', { method: 'POST' });
    assert.equal(setupRes.status, 200);
    assert.match(setupRes.body.qr, /^data:image\/png;base64,/);
    const { secreto } = setupRes.body;

    assert.equal((await c.call('/auth/mfa/confirmar', { method: 'POST', body: { codigo: '000000' } })).status, 400);
    const confirmed = await c.call('/auth/mfa/confirmar', { method: 'POST', body: { codigo: totpCode(secreto) } });
    assert.equal(confirmed.body.usuario.mfa_activo, true);
    const row = await db.one('SELECT mfa_secreto_cifrado FROM usuarios WHERE email = $1', [EMAILS.operadorOt]);
    assert.ok(!row.mfa_secreto_cifrado.includes(secreto), 'el secreto no se guarda en claro');

    const fresh = srv.client();
    const step1 = await fresh.login(EMAILS.operadorOt);
    assert.equal(step1.body.mfaRequerido, true);
    assert.equal(fresh.cookie, null, 'sin código no hay sesión');
    assert.equal((await fresh.call('/auth/mfa', { method: 'POST', body: { desafio: step1.body.desafio, codigo: '123456' } })).status, 401);
    const step2 = await fresh.call('/auth/mfa', { method: 'POST', body: { desafio: step1.body.desafio, codigo: totpCode(secreto) } });
    assert.equal(step2.status, 200);
    assert.equal((await fresh.call('/dashboard')).status, 200);
  });

  test('si APP_SECRET cambia, el MFA responde 409 con un mensaje claro (no un 500)', async () => {
    const email = 'rotacion@colonial.local';
    await db.query(
      `INSERT INTO usuarios (nombre, email, rol, clave_hash) SELECT 'Prueba rotación', $1, 'legal', clave_hash FROM usuarios WHERE email = $2`,
      [email, EMAILS.coordinador],
    );
    const c = srv.client();
    await c.login(email);
    const { secreto } = (await c.call('/auth/mfa/configurar', { method: 'POST' })).body;
    await c.call('/auth/mfa/confirmar', { method: 'POST', body: { codigo: totpCode(secreto) } });

    const rotated = await startServer(db, testConfig({ appSecret: 'otra-clave-de-servidor-con-mas-de-32-caracteres' }));
    try {
      const fresh = rotated.client();
      const step1 = await fresh.login(email);
      const res = await fresh.call('/auth/mfa', { method: 'POST', body: { desafio: step1.body.desafio, codigo: totpCode(secreto) } });
      assert.equal(res.status, 409);
      assert.match(res.body.error.message, /clave del servidor cambió/);
    } finally {
      await rotated.close();
    }
  });

  test('un rol con MFA obligatorio no opera hasta activarlo', async () => {
    const strict = await startServer(db, testConfig({ mfaRequiredRoles: ['coordinador'] }));
    try {
      const c = strict.client();
      const res = await c.login(EMAILS.coordinador);
      assert.equal(res.body.mfaPendiente, true);
      assert.equal((await c.call('/dashboard')).status, 403);
      assert.equal((await c.call('/auth/sesion')).status, 200, 'puede entrar a Mi cuenta para activarlo');
    } finally {
      await strict.close();
    }
  });

  test('cambio de contraseña con política y cierre de sesión', async () => {
    const c = srv.client();
    await c.login(EMAILS.comunicaciones);
    assert.equal((await c.call('/auth/clave', { method: 'POST', body: { actual: 'Colonial2021!', nueva: 'corta' } })).status, 400);
    assert.equal((await c.call('/auth/clave', { method: 'POST', body: { actual: 'Colonial2021!', nueva: 'Turno de noche 2026' } })).status, 204);
    assert.equal((await srv.client().login(EMAILS.comunicaciones, 'Turno de noche 2026')).status, 200);
    assert.equal((await c.call('/auth/logout', { method: 'POST' })).status, 204);
    assert.equal((await c.call('/dashboard')).status, 401);
  });

  test('limita los intentos de inicio de sesión por IP (429)', async () => {
    const limited = await startServer(db, testConfig({ loginRateLimit: 3 }));
    try {
      const c = limited.client();
      const statuses = [];
      for (let i = 0; i < 4; i += 1) statuses.push((await c.login('nadie@colonial.local', 'Xx1234567890')).status);
      assert.deepEqual(statuses, [401, 401, 401, 429]);
    } finally {
      await limited.close();
    }
  });

  test('solo el coordinador consulta la bitácora de seguridad', async () => {
    const analyst = srv.client();
    await analyst.login(EMAILS.analistaTi);
    assert.equal((await analyst.call('/seguridad/eventos')).status, 403);
    const coord = srv.client();
    await coord.login(EMAILS.coordinador);
    const res = await coord.call('/seguridad/eventos');
    assert.equal(res.status, 200);
    assert.ok(res.body.some((e) => e.evento === 'login_exitoso'));
  });
});
