import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

// ---------------------------------------------------------------- PIN

/** Hash de un PIN con scrypt y sal aleatoria. Nunca se guarda el PIN en claro. */
export function hashPin(pin) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(pin), salt, 32);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPin(pin, stored) {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(pin), Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export const isValidPin = (pin) => /^\d{4}$/.test(String(pin ?? ''));

/** Comparación en tiempo constante para secretos cortos (PIN de personal). */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------------------------------------------------------------- tokens

const b64 = (buf) => Buffer.from(buf).toString('base64url');

/**
 * Tokens de sesión firmados con HMAC-SHA256 (mismo principio que un JWT HS256,
 * sin dependencias). Contienen rol, identificador y vencimiento.
 */
export function createTokenService({ secret, clock = () => new Date() }) {
  const sign = (data) => createHmac('sha256', secret).update(data).digest();

  return {
    /** @param {{ role: string, sub: string }} claims @param {number} ttlSeconds */
    issue(claims, ttlSeconds) {
      const payload = b64(JSON.stringify({ ...claims, exp: Math.floor(clock().getTime() / 1000) + ttlSeconds }));
      return `${payload}.${b64(sign(payload))}`;
    },

    /** @returns {{ role: string, sub: string, exp: number } | null} */
    verify(token) {
      const [payload, signature] = String(token ?? '').split('.');
      if (!payload || !signature) return null;
      const expected = sign(payload);
      const received = Buffer.from(signature, 'base64url');
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
      try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return claims.exp * 1000 > clock().getTime() ? claims : null;
      } catch {
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------- intentos

/**
 * Limita intentos fallidos por clave (p. ej. número de celular): con un PIN de
 * 4 dígitos, sin esto se podría adivinar probando las 10.000 combinaciones.
 */
export function createAttemptLimiter({ max = 5, windowMs = 15 * 60_000, clock = () => new Date() } = {}) {
  /** @type {Map<string, { count: number, until: number }>} */
  const failures = new Map();

  return {
    isBlocked(key) {
      const f = failures.get(key);
      if (!f) return false;
      if (f.until < clock().getTime()) { failures.delete(key); return false; }
      return f.count >= max;
    },
    fail(key) {
      const now = clock().getTime();
      const f = failures.get(key);
      failures.set(key, f && f.until >= now ? { count: f.count + 1, until: f.until } : { count: 1, until: now + windowMs });
    },
    reset(key) {
      failures.delete(key);
    },
  };
}
