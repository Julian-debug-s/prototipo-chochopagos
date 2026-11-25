/**
 * Errores tipados. La capa HTTP los traduce a códigos de estado;
 * el dominio y la aplicación nunca conocen HTTP.
 */
export class AppError extends Error {
  /**
   * @param {string} code  Código estable legible por máquinas (p. ej. "INVALID_TRANSITION").
   * @param {string} message  Mensaje en español apto para mostrar al usuario.
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

/** Una regla de negocio impide la operación. */
export class DomainError extends AppError {}

/** El recurso pedido no existe. */
export class NotFoundError extends AppError {
  constructor(entity, id) {
    super('NOT_FOUND', `${entity} ${id} no existe`, { entity, id });
  }
}

/** Los datos de entrada no son válidos. */
export class ValidationError extends AppError {
  constructor(message, details) {
    super('VALIDATION_ERROR', message, details);
  }
}

/** Otro proceso modificó el registro primero (bloqueo optimista). */
export class ConcurrencyError extends AppError {
  constructor(entity, id) {
    super('CONCURRENT_MODIFICATION', `${entity} ${id} fue modificado por otra operación. Intenta de nuevo.`, { entity, id });
  }
}

/** Credenciales ausentes o sin permisos suficientes. */
export class AuthError extends AppError {
  constructor(code = 'UNAUTHORIZED', message = 'No autorizado') {
    super(code, message);
  }
}
