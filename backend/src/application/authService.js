import { AuthError } from '../shared/errors.js';
import { safeEqual, createAttemptLimiter } from '../shared/security.js';
import { normalizeColombianMobile } from '../domain/phone.js';

const CUSTOMER_TTL = 7 * 24 * 3600;
const STAFF_TTL = 12 * 3600; // un turno

/**
 * Inicio de sesión de clientes (celular + PIN) y del personal (código + PIN),
 * igual que las pantallas de acceso del prototipo. Devuelve tokens firmados.
 *
 * @param {{
 *   userService: ReturnType<typeof import('./userService.js').createUserService>,
 *   tokens: ReturnType<typeof import('../shared/security.js').createTokenService>,
 *   staff: { operator: { id: string, pin: string, name: string }, center: { id: string, pin: string } },
 *   clock: () => Date,
 * }} deps
 */
export function createAuthService({ userService, tokens, staff, clock }) {
  const limiter = createAttemptLimiter({ clock });
  const blocked = () => new AuthError('TOO_MANY_ATTEMPTS', 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.');

  const session = (actor, ttl) => ({ token: tokens.issue({ role: actor.role, sub: actor.id }, ttl), actor });

  return {
    loginCustomer(phone, pin) {
      const key = `customer:${normalizeColombianMobile(phone) ?? phone}`;
      if (limiter.isBlocked(key)) throw blocked();
      if (!userService.checkPin(phone, pin)) {
        limiter.fail(key);
        throw new AuthError('INVALID_CREDENTIALS', 'Celular o PIN incorrectos');
      }
      limiter.reset(key);
      const user = userService.get(phone);
      return session({ role: 'customer', id: user.phone }, CUSTOMER_TTL);
    },

    /** Sesión para un cliente recién registrado. */
    issueCustomer(user) {
      return session({ role: 'customer', id: user.phone }, CUSTOMER_TTL);
    },

    loginStaff(code, pin) {
      const normalized = String(code ?? '').trim().toUpperCase();
      const key = `staff:${normalized}`;
      if (limiter.isBlocked(key)) throw blocked();
      const match = [['operator', staff.operator], ['center', staff.center]]
        .find(([, s]) => s.id.toUpperCase() === normalized && safeEqual(s.pin, pin));
      if (!match) {
        limiter.fail(key);
        throw new AuthError('INVALID_CREDENTIALS', 'Código o PIN incorrectos');
      }
      limiter.reset(key);
      return session({ role: match[0], id: match[1].id }, STAFF_TTL);
    },

    /** @returns {{ role: 'customer'|'operator'|'center', id: string } | null} */
    authenticate(token) {
      const claims = tokens.verify(token);
      if (!claims) return null;
      if (claims.role === 'customer' && !userService.find(claims.sub)) return null;
      return { role: claims.role, id: claims.sub };
    },
  };
}
