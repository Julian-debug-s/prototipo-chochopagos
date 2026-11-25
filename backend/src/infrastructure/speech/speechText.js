/**
 * Prepara un mensaje del asistente para leerlo en voz alta:
 * quita formato y emojis, lee los montos como pesos y nombra las opciones.
 * @param {import('../../application/conversation/messages.js').OutgoingMessage} message
 */
export function speechTextFor(message) {
  const options = message.type === 'buttons'
    ? message.buttons.map((b) => b.title)
    : message.type === 'list' ? message.sections.flatMap((s) => s.rows.map((r) => r.title)) : [];
  const body = clean(message.body);
  const choices = options.map(clean).filter(Boolean);
  if (!choices.length) return body;
  return `${/[.?!:]$/.test(body) ? body : `${body}.`} Opciones: ${choices.join(', ')}.`;
}

function clean(text) {
  return String(text ?? '')
    .replace(/[*_~]/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/\$\s?(\d{1,3}(?:\.\d{3})+|\d+)/g, (_m, n) => `${n.replace(/\./g, '')} pesos`) // $42.300 → 42300 pesos
    .replace(/\b(\d{1,3}(?:\.\d{3})+)\b/g, (n) => n.replace(/\./g, '')) // 1.036.123 → 1036123
    .replace(/#(\d+)/g, 'número $1')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();
}
