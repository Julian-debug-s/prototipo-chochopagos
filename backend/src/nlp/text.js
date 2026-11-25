/**
 * Interpretación de texto libre en español (funciones puras).
 * Migrado de norm / detect / parseNum / parseOcrText del prototipo.
 */
import { findService } from '../domain/catalog.js';

/** Minúsculas, sin tildes ni signos, espacios simples. */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Orden de prioridad: el primer patrón que coincide gana. */
const SERVICE_PATTERNS = [
  ['wallet_topup', /\b(monedero|billetera)\b/],
  ['data_package', /\b(datos|paquete|gigas?)\b/],
  ['mobile_topup', /\b(recarg\w*|minutos|celular)\b/],
  ['soat', /\bsoat\b/],
  ['property_tax', /\b(predial|impuesto\w*)\b/],
  ['civil_registry', /(registro civil|copia)/],
  ['eps_authorization', /\b(eps|medicamentos?|autorizacion|salud)\b/],
  ['remittance', /\b(giro|girar|enviar (plata|dinero)|mandar (plata|dinero))\b/],
  ['bank_deposit', /\b(consign\w*|deposit\w*|banco|bancolombia|bancaria|transaccion)\b/],
  ['card_payment', /\b(tarjeta|credito)\b/],
  ['coop_fee', /\bcooperativa\b/],
  ['internet_tv', /\b(internet|wifi|television|tv)\b/],
  ['gas', /\bgas\b/],
  ['water', /\b(agua|acueducto)\b/],
  ['energy', /\b(luz|energia|epm|electric\w*)\b/],
];

/**
 * @param {string} text texto ya normalizado o crudo
 * @returns {string|null} código de servicio
 */
export function detectService(text) {
  const t = normalize(text);
  if (/\b(chec|energia electrica|electricidad|consumo de energia|factura de energia|alumbrado publico)\b/.test(t) && !/\b(predial|impuesto predial)\b/.test(t)) return 'energy';
  if (/\b(aguas? de marinilla|acueducto|agua potable)\b/.test(t)) return 'water';
  for (const [code, pattern] of SERVICE_PATTERNS) if (pattern.test(t)) return code;
  return null;
}

const NUMBER_WORDS = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};

/**
 * Extrae un valor en pesos: "85000", "85.000", "$ 85.000", "85 mil", "ochenta y cinco mil".
 * @param {number} [min=1000] valores menores se ignoran (evita confundir "2 GB" con un monto)
 * @returns {number|null}
 */
export function parseAmount(text, min = 1000) {
  const t = normalize(text);
  const numeric = t.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:\s*(mil|millones|millon))?/);
  if (numeric) {
    let n = parseInt(numeric[1].replace(/[.\s]/g, ''), 10);
    if (numeric[2] === 'mil') n *= 1000;
    else if (numeric[2]) n *= 1_000_000;
    return n >= min ? n : null;
  }

  let best = 0;
  let run = [];
  const flush = () => {
    if (!run.length) return;
    let total = 0;
    let current = 0;
    for (const w of run) {
      if (w === 'mil') { total += (current || 1) * 1000; current = 0; }
      else if (/^millon/.test(w)) { total += (current || 1) * 1_000_000; current = 0; }
      else if (NUMBER_WORDS[w] !== undefined) current += NUMBER_WORDS[w];
    }
    best = Math.max(best, total + current);
    run = [];
  };
  for (const w of t.split(' ')) {
    if (NUMBER_WORDS[w] !== undefined || w === 'mil' || /^millon/.test(w) || (w === 'y' && run.length)) run.push(w);
    else flush();
  }
  flush();
  return best >= min ? best : null;
}

const YES = /\b(si|sii|claro|dale|confirmo|confirmar|correcto|listo|ok|okay|perfecto|exacto|de una|esta bien|acepto|autorizo)\b/;
const NO = /\b(no|nel|corregir|cambiar|incorrecto)\b/;

export const isYes = (text) => YES.test(normalize(text)) && !/\bno\b/.test(normalize(text));
export const isNo = (text) => NO.test(normalize(text));

/**
 * Extrae datos de un recibo a partir del texto que devuelve el OCR.
 * @returns {{ readable: boolean, serviceCode: string|null, company: string, reference: string, amount: number, dueDate: string, confidence: number }}
 */
export function parseReceiptText(rawText) {
  const raw = String(rawText ?? '');
  const serviceCode = detectService(raw);
  const service = serviceCode ? findService(serviceCode) : null;
  const company = /\bchec\b/i.test(raw) ? 'CHEC' : service ? (service.providers[0] ?? service.name) : '';

  const refMatch = raw.match(/(?:contrato|cuenta|matr[ií]cula|referencia|obligaci[oó]n|placa|celular|tel[eé]fono)[^\dA-Z]*(\d[\d\s.-]{4,})/i) ?? raw.match(/\b\d{7,12}\b/);
  const reference = refMatch ? String(refMatch[1] ?? refMatch[0]).replace(/[^0-9A-Za-z]/g, '') : '';

  let amount = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (!/(total|valor|pagar|pago|saldo|importe)/i.test(line)) continue;
    const m = line.match(/(?:\$\s*)?([0-9][0-9.,\s]{2,})/);
    if (m && (amount = moneyFromOcr(m[1]))) break;
  }
  if (!amount) {
    const m = raw.match(/\$\s*([0-9][0-9.,\s]{2,})/);
    if (m) amount = moneyFromOcr(m[1]);
  }

  const dateMatch = raw.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]20\d{2})\b/);
  const dueDate = dateMatch ? dateMatch[1] : '';

  const confidence = (serviceCode ? 0.35 : 0) + (reference ? 0.25 : 0) + (amount >= 1000 ? 0.3 : 0) + (dueDate ? 0.1 : 0);
  return { readable: Boolean(serviceCode || reference || amount), serviceCode, company, reference, amount, dueDate, confidence: Number(confidence.toFixed(2)) };
}

function moneyFromOcr(value) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  const n = parseInt(digits, 10) || 0;
  return n >= 1000 ? n : 0;
}
