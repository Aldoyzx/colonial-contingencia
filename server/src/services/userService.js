import { UnauthorizedError, ValidationError } from '../domain/errors.js';

export function listUsers(db) {
  return db.many('SELECT id, nombre, email, rol FROM usuarios WHERE activo ORDER BY id');
}

export async function getActiveUser(db, userId) {
  const user = await db.one('SELECT id, nombre, email, rol FROM usuarios WHERE id = $1 AND activo', [userId]);
  if (!user) throw new UnauthorizedError('Usuario inexistente o inactivo');
  return user;
}

export async function requireActiveUserById(db, userId, field = 'responsableId') {
  const user = await db.one('SELECT id, nombre, rol FROM usuarios WHERE id = $1 AND activo', [userId]);
  if (!user) throw new ValidationError(`${field}: el usuario ${userId} no existe o está inactivo`);
  return user;
}

/** Primer usuario activo con el rol indicado; útil para asignar acciones automáticas. */
export function findUserByRole(db, rol) {
  return db.one('SELECT id FROM usuarios WHERE rol = $1 AND activo ORDER BY id LIMIT 1', [rol]);
}
