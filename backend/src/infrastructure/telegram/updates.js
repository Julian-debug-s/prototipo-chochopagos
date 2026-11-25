/**
 * Convierte un `Update` de Telegram en algo que el resto del sistema entiende.
 * Solo se atienden chats privados.
 *
 * @typedef {{ chatId: string, messageId?: number, updateId: number }} Base
 * @typedef {Base & { kind: 'message', content: Omit<import('../../application/conversation/conversationService.js').IncomingMessage, 'messageId'|'from'> }} MessageUpdate
 * @typedef {Base & { kind: 'contact', phone: string, ownContact: boolean }} ContactUpdate
 * @typedef {Base & { kind: 'callback', callbackId: string, content: { type: 'reply', replyId: string, text: string } }} CallbackUpdate
 * @returns {MessageUpdate | ContactUpdate | CallbackUpdate | null}
 */
export function parseUpdate(update) {
  const q = update?.callback_query;
  if (q) {
    const chat = q.message?.chat;
    if (!chat || chat.type !== 'private' || typeof q.data !== 'string') return null;
    return {
      kind: 'callback',
      updateId: update.update_id,
      chatId: String(chat.id),
      messageId: q.message.message_id,
      callbackId: q.id,
      content: { type: 'reply', replyId: q.data, text: buttonLabel(q.message, q.data) ?? q.data },
    };
  }

  const m = update?.message;
  if (!m || m.chat?.type !== 'private') return null;
  const base = { updateId: update.update_id, chatId: String(m.chat.id), messageId: m.message_id };
  if (m.contact) {
    // Solo vale el contacto propio (botón "Compartir mi número"), no el de otra persona.
    return { ...base, kind: 'contact', phone: m.contact.phone_number ?? '', ownContact: Boolean(m.from && m.contact.user_id === m.from.id) };
  }
  return { ...base, kind: 'message', content: parseContent(m) };
}

function buttonLabel(message, data) {
  for (const row of message?.reply_markup?.inline_keyboard ?? []) {
    for (const button of row) if (button.callback_data === data) return button.text;
  }
  return null;
}

function parseContent(m) {
  if (typeof m.text === 'string') return { type: 'text', text: commandToText(m.text) };
  if (m.photo?.length) {
    const best = m.photo.at(-1); // Telegram manda varios tamaños; el último es el más grande.
    return { type: 'image', text: m.caption ?? '', media: { id: best.file_id, mimeType: 'image/jpeg' } };
  }
  if (m.document?.mime_type?.startsWith('image/')) {
    return { type: 'image', text: m.caption ?? '', media: { id: m.document.file_id, mimeType: m.document.mime_type } };
  }
  if (m.voice || m.audio) {
    const a = m.voice ?? m.audio;
    return { type: 'audio', media: { id: a.file_id, mimeType: a.mime_type } };
  }
  return { type: 'unsupported' };
}

/** "/start" → "hola"; "/menu" → "menu"; "/ayuda@ChochoBot" → "ayuda". */
export function commandToText(text) {
  const match = /^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return text;
  const name = match[1].toLowerCase();
  if (name === 'start') return 'hola';
  return [name, match[2]?.trim()].filter(Boolean).join(' ');
}
