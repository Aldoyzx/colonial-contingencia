import { ForbiddenError, UnauthorizedError } from '../domain/errors.js';
import { getPublicUser } from '../services/authService.js';
import { signToken, verifyToken } from '../security/tokens.js';

export const SESSION_COOKIE = 'cc_sesion';
const MFA_CHALLENGE_SECONDS = 5 * 60;

/** Contexto de auditoría de la petición (IP real detrás del proxy de la nube). */
export const requestContext = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

export function createSessionManager(config) {
  const cookieOptions = {
    httpOnly: true, // JavaScript del navegador no puede leerla (mitiga robo por XSS)
    sameSite: 'strict', // no viaja en peticiones iniciadas desde otros sitios (mitiga CSRF)
    secure: config.isProduction, // solo por HTTPS en la nube
    path: '/',
  };

  return {
    issueSession(res, userId) {
      const ttl = config.sessionHours * 3600;
      res.cookie(SESSION_COOKIE, signToken({ typ: 'sesion', sub: userId }, config.appSecret, ttl), { ...cookieOptions, maxAge: ttl * 1000 });
    },
    clearSession(res) {
      res.clearCookie(SESSION_COOKIE, cookieOptions);
    },
    issueMfaChallenge(userId) {
      return signToken({ typ: 'mfa', sub: userId }, config.appSecret, MFA_CHALLENGE_SECONDS);
    },
    readMfaChallenge(token) {
      const payload = verifyToken(token, config.appSecret, 'mfa');
      if (!payload) throw new UnauthorizedError('El desafío MFA venció; vuelve a iniciar sesión');
      return payload.sub;
    },
  };
}

/** El usuario debe configurar MFA antes de operar si su rol lo exige. */
export const mfaPending = (user, config) => config.mfaRequiredRoles.includes(user.rol) && !user.mfa_activo;

/**
 * Autenticación por cookie de sesión firmada. Para métodos que modifican datos se exige
 * además la cabecera X-Requested-With: un sitio ajeno no puede enviarla sin permiso CORS.
 */
export function authenticate(db, config, { allowMfaPending = false } = {}) {
  return async (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Requested-With') !== 'XMLHttpRequest') {
      throw new ForbiddenError('Petición rechazada: falta la cabecera anti-CSRF');
    }
    const payload = verifyToken(req.cookies?.[SESSION_COOKIE], config.appSecret, 'sesion');
    if (!payload) throw new UnauthorizedError('Inicia sesión para continuar');
    const user = await getPublicUser(db, payload.sub);
    if (!user) throw new UnauthorizedError('Usuario inexistente o inactivo');
    if (!allowMfaPending && mfaPending(user, config)) {
      throw new ForbiddenError('Tu rol exige MFA: actívalo en "Mi cuenta" para continuar');
    }
    req.user = user;
    next();
  };
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user.rol)) throw new ForbiddenError('Tu rol no tiene acceso a este recurso');
    next();
  };
}
