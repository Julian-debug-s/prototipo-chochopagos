/**
 * Números de celular colombianos. Se guardan en formato E.164 sin "+",
 * por ejemplo "573128889900".
 */
const COUNTRY = '57';

/** @returns {string|null} número normalizado o null si no es un celular colombiano válido. */
export function normalizeColombianMobile(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith(COUNTRY) ? digits.slice(2) : digits;
  return /^3\d{9}$/.test(local) ? COUNTRY + local : null;
}

/** "573128889900" -> "312 888 9900" */
export function formatLocalMobile(e164) {
  const local = String(e164).replace(/^57/, '');
  return local.length === 10 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : local;
}
