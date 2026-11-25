import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError, AuthError, ConcurrencyError, DomainError, NotFoundError, ValidationError } from '../shared/errors.js';

// ---------------------------------------------------------------- autenticación

/**
 * Lee el token de sesión (Authorization: Bearer …) y deja en `req.actor`
 * el rol y su identificador. Cliente: { role: 'customer', id: '57312…' }.
 * @param {{ authenticate(token: string): { role: string, id: string } | null }} authService
 */
export function authenticate(authService) {
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const actor = token ? authService.authenticate(token) : null;
    if (!actor) return next(new AuthError('UNAUTHORIZED', 'Sesión vencida o inválida. Ingresa de nuevo.'));
    req.actor = actor;
    next();
  };
}

/** Autorización por rol (principio de mínimo privilegio). */
export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.actor?.role) ? next() : next(new AuthError('FORBIDDEN', 'Tu rol no puede hacer esta operación'));

// ---------------------------------------------------------------- validación

/** Valida y reemplaza req.body / req.query / req.params con datos ya tipados. */
export const validate = (schemas) => (req, _res, next) => {
  try {
    req.valid = {};
    for (const part of ['params', 'query', 'body']) {
      if (schemas[part]) req.valid[part] = schemas[part].parse(req[part] ?? {});
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const idParam = z.object({ id: z.coerce.number().int().positive() });

// ---------------------------------------------------------------- transversal

export function requestContext(logger) {
  return (req, res, next) => {
    const id = req.get('x-request-id') ?? randomUUID();
    const start = process.hrtime.bigint();
    req.id = id;
    req.log = logger.child({ requestId: id });
    res.set('X-Request-Id', id);
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      req.log.info('http_request', { method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) });
    });
    next();
  };
}

export function securityHeaders(_req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  next();
}

/** Traduce errores tipados a respuestas HTTP con un formato uniforme. */
export function errorHandler(err, req, res, _next) {
  const status = statusFor(err);
  if (status >= 500) (req.log ?? console).error('unhandled_error', { error: err });

  const body = err instanceof z.ZodError
    ? { error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } }
    : err instanceof AppError
      ? { error: { code: err.code, message: err.message, details: err.details } }
      : err?.type === 'entity.parse.failed'
        ? { error: { code: 'INVALID_JSON', message: 'El cuerpo no es JSON válido' } }
        : { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } };

  res.status(status).json({ ...body, requestId: req.id });
}

function statusFor(err) {
  if (err instanceof z.ZodError || err instanceof ValidationError) return 400;
  if (err?.type === 'entity.parse.failed') return 400;
  if (err?.type === 'entity.too.large') return 413;
  if (err instanceof AuthError) return err.code === 'FORBIDDEN' ? 403 : err.code === 'TOO_MANY_ATTEMPTS' ? 429 : 401;
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ConcurrencyError) return 409;
  if (err instanceof DomainError) return 422;
  return 500;
}
