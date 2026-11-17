import { UnauthorizedError, ValidationError } from '../domain/errors.js';

export function listUsers(db) {
  return db.prepare('SELECT id, nombre, email, rol FROM usuarios WHERE activo = 1 ORDER BY id').all();
}

export function getActiveUser(db, userId) {
  const user = db.prepare('SELECT id, nombre, email, rol FROM usuarios WHERE id = ? AND activo = 1').get(userId);
  if (!user) throw new UnauthorizedError('Usuario inexistente o inactivo');
  return user;
}

export function requireActiveUserById(db, userId, field = 'responsableId') {
  const user = db.prepare('SELECT id, nombre, rol FROM usuarios WHERE id = ? AND activo = 1').get(userId);
  if (!user) throw new ValidationError(`${field}: el usuario ${userId} no existe o está inactivo`);
  return user;
}

/** Primer usuario activo con el rol indicado; útil para asignar acciones automáticas. */
export function findUserByRole(db, rol) {
  return db.prepare('SELECT id FROM usuarios WHERE rol = ? AND activo = 1 ORDER BY id LIMIT 1').get(rol) ?? null;
}
