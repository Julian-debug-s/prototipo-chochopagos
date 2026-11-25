import { MIN_AMOUNT, MAX_AMOUNT } from '../../domain/catalog.js';
import { normalizeColombianMobile } from '../../domain/phone.js';
import { formatCOP } from '../../domain/money.js';
import { parseAmount, isNo } from '../../nlp/text.js';

/**
 * Un parser por tipo de campo (patrón Strategy). Agregar un tipo nuevo es
 * agregar una entrada aquí, sin tocar el flujo de conversación.
 *
 * Cada parser devuelve { ok: true, value } o { ok: false, error }.
 */
const PARSERS = {
  amount(raw) {
    const n = parseAmount(raw);
    if (n === null) return fail(`Escribe el valor en números, por ejemplo *85000* o *85 mil*. Mínimo ${formatCOP(MIN_AMOUNT)}.`);
    if (n > MAX_AMOUNT) return fail(`El valor máximo es ${formatCOP(MAX_AMOUNT)}.`);
    return ok(n);
  },

  phone(raw) {
    const n = normalizeColombianMobile(raw);
    return n ? ok(n.slice(2)) : fail('Escribe un celular de 10 dígitos que empiece por 3, por ejemplo *3128889900*.');
  },

  document(raw) {
    const digits = String(raw).replace(/\D/g, '');
    return digits.length >= 5 && digits.length <= 12 ? ok(digits) : fail('Escribe el número de documento sin puntos (entre 5 y 12 dígitos).');
  },

  date(raw) {
    const m = String(raw).trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/) ?? String(raw).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return fail('Escribe la fecha así: *DD/MM/AAAA*, por ejemplo 15/03/1980.');
    const [d, mo, y] = m[1].length === 4 ? [m[3], m[2], m[1]] : [m[1], m[2], m[3]];
    const date = new Date(Date.UTC(+y, +mo - 1, +d));
    const valid = date.getUTCDate() === +d && date.getUTCMonth() === +mo - 1 && date <= new Date() && +y >= 1900;
    return valid ? ok(date.toISOString().slice(0, 10)) : fail('Esa fecha no es válida. Usa *DD/MM/AAAA*.');
  },

  text(raw) {
    const value = String(raw).trim().replace(/\s+/g, ' ');
    if (value.length < 2) return fail('Ese dato está muy corto. Escríbelo de nuevo.');
    if (value.length > 120) return fail('Ese dato está muy largo (máximo 120 caracteres).');
    return ok(value);
  },
};

/**
 * @param {import('../../domain/catalog.js').FieldSpec} field
 * @param {string} raw
 */
export function parseField(field, raw) {
  if (field.optional && (isNo(raw) || /^\s*-\s*$/.test(raw) || /^omitir$/i.test(String(raw).trim()))) return ok('');
  const parser = PARSERS[field.type] ?? PARSERS.text;
  return parser(raw);
}

function ok(value) { return { ok: true, value }; }
function fail(error) { return { ok: false, error }; }
