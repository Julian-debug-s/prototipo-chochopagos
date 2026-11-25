/**
 * Traduce los mensajes neutros del asistente (ver application/conversation/messages.js)
 * al formato de la Telegram Bot API.
 */

const LIMITS = { text: 4000, button: 60, callbackDataBytes: 64 };

const cut = (value, max) => {
  const s = String(value ?? '');
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
};

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Los textos del asistente usan *negrita* y _cursiva_ (igual que la app web).
 * Se pasan a HTML de Telegram después de escapar, así ningún texto del usuario
 * puede inyectar etiquetas.
 */
export function markupToHtml(text) {
  return escapeHtml(String(text ?? ''))
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/_([^_\n]+)_/g, '<i>$1</i>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>');
}

function callbackData(id) {
  if (Buffer.byteLength(id, 'utf8') > LIMITS.callbackDataBytes) throw new Error(`Identificador de botón demasiado largo para Telegram: ${id}`);
  return id;
}

const body = (text) => ({ text: markupToHtml(cut(text, LIMITS.text)) || '…', parse_mode: 'HTML' });
const keyboard = (items) => ({ reply_markup: { inline_keyboard: items.map((b) => [{ text: cut(b.text, LIMITS.button), callback_data: callbackData(b.id) }]) } });

/**
 * @param {import('../../application/conversation/messages.js').OutgoingMessage} message
 * @returns {object} parámetros para sendMessage (sin chat_id)
 */
export function toTelegramPayload(message) {
  switch (message.type) {
    case 'text':
      return body(message.body);
    case 'buttons':
      return { ...body(message.body), ...keyboard(message.buttons.map((b) => ({ id: b.id, text: b.title }))) };
    case 'list': {
      // Telegram no tiene listas desplegables: cada fila es un botón.
      const rows = message.sections.flatMap((s) => s.rows);
      return { ...body(message.body), ...keyboard(rows.map((r) => ({ id: r.id, text: r.description ? `${r.title} · ${r.description}` : r.title }))) };
    }
    default:
      throw new Error(`Tipo de mensaje no soportado: ${message.type}`);
  }
}
