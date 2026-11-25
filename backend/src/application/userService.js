import { ValidationError, NotFoundError, DomainError } from '../shared/errors.js';
import { normalizeColombianMobile } from '../domain/phone.js';
import { hashPin, verifyPin, isValidPin } from '../shared/security.js';

/**
 * Casos de uso de clientes.
 * @param {{ users: ReturnType<typeof import('../infrastructure/repositories/userRepository.js').createUserRepository>, clock: () => Date, sectors: string[] }} deps
 */
export function createUserService({ users, clock, sectors }) {
  const service = {
    /**
     * Mismas reglas que el formulario de registro del prototipo.
     * @param {{ phone: string, name: string, document: string, sector: string, address: string, pin: string, consent: boolean }} input
     */
    register({ phone, name, document, sector, address, pin, consent }) {
      const normalized = normalizeColombianMobile(phone);
      if (!name || name.trim().length < 5) throw new ValidationError('Escribe tu nombre completo');
      if (!/^\d{6,10}$/.test(String(document ?? ''))) throw new ValidationError('La cédula debe tener entre 6 y 10 números');
      if (!normalized) throw new ValidationError('El celular debe tener 10 números y empezar por 3');
      if (users.findByPhone(normalized)) throw new DomainError('ALREADY_REGISTERED', 'Ese celular ya está registrado. Ingresa a tu cuenta');
      if (!sectors.includes(sector)) throw new ValidationError('Sector no válido', { allowed: sectors });
      if (!address || address.trim().length < 5) throw new ValidationError('Escribe indicaciones para llegar a tu casa');
      if (!isValidPin(pin)) throw new ValidationError('El PIN debe tener 4 números');
      if (!consent) throw new DomainError('CONSENT_REQUIRED', 'Debes aceptar el tratamiento de datos');

      const now = clock();
      return users.insert({
        phone: normalized, name: name.trim(), document: String(document), sector, address: address.trim(),
        pinHash: hashPin(pin), consentAt: now, createdAt: now,
      });
    },

    find(phone) {
      const normalized = normalizeColombianMobile(phone);
      return normalized ? users.findByPhone(normalized) : null;
    },

    get(phone) {
      const user = service.find(phone);
      if (!user) throw new NotFoundError('Usuario', phone);
      return user;
    },

    /** @returns {boolean} */
    checkPin(phone, pin) {
      const user = service.find(phone);
      return Boolean(user && isValidPin(pin) && verifyPin(pin, user.pinHash));
    },

    list: () => users.list(),
  };
  return service;
}

export const firstName = (user) => user.name.split(' ')[0];

/** Datos del usuario aptos para la API (sin el hash del PIN). */
export function userDto(user) {
  const { pinHash, ...safe } = user;
  return { ...safe, localPhone: user.phone.replace(/^57/, ''), consentAt: user.consentAt.toISOString(), createdAt: user.createdAt.toISOString() };
}
