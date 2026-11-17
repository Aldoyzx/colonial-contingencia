export class AppError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Usuario no identificado') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message) {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(entity, id) {
    super(`${entity} ${id} no existe`, 404, 'NOT_FOUND');
  }
}

/** Regla de negocio violada: la petición es válida pero el estado actual no la permite. */
export class BusinessRuleError extends AppError {
  constructor(message) {
    super(message, 409, 'BUSINESS_RULE');
  }
}
