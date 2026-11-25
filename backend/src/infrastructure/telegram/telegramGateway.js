import { toTelegramPayload } from './format.js';
import { speechTextFor } from '../speech/speechText.js';

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', oga: 'audio/ogg', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav' };

/**
 * Implementa los puertos `messaging` y `mediaDownloader` sobre Telegram.
 * El sistema identifica a los clientes por celular; aquí se traduce a chat de Telegram.
 *
 * @param {{
 *   api: import('./botApi.js').BotApi,
 *   links: ReturnType<typeof import('../repositories/telegramLinkRepository.js').createTelegramLinkRepository>,
 *   synthesizer?: { synthesize(text: string): Promise<Buffer> } | null,
 *   logger: import('../../shared/logger.js').Logger,
 * }} deps
 */
export function createTelegramGateway({ api, links, synthesizer = null, logger }) {
  // Último mensaje con botones por chat. Al avanzar la conversación (aquí o en la app)
  // se le quitan, para que en Telegram solo queden activos los botones del paso actual.
  /** @type {Map<string, number>} */
  const openKeyboards = new Map();

  function closeKeyboard(chatId) {
    const messageId = openKeyboards.get(chatId);
    if (!messageId) return;
    openKeyboards.delete(chatId);
    api.call('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
      .catch((error) => logger.debug('telegram_keyboard_not_closed', { error: error.message }));
  }

  async function sendVoice(chatId, message) {
    try {
      const audio = await synthesizer.synthesize(speechTextFor(message));
      await api.upload('sendVoice', { chat_id: chatId }, { field: 'voice', buffer: audio, filename: 'chochopagos.ogg', type: 'audio/ogg' });
    } catch (error) {
      logger.warn('telegram_voice_failed', { error: error.message });
    }
  }

  return {
    /**
     * @param {string} phone
     * @param {import('../../application/conversation/messages.js').OutgoingMessage} message
     * @param {{ voice?: boolean }} [options] voice: además del texto, enviarlo como nota de voz
     */
    async send(phone, message, { voice = false } = {}) {
      const chatId = links.chatFor(phone);
      if (!chatId) {
        // La persona usa solo la app web o todavía no ha escrito al bot.
        logger.debug('telegram_not_linked', { to: phone });
        return;
      }
      closeKeyboard(chatId);
      const sent = await api.call('sendMessage', { chat_id: chatId, ...toTelegramPayload(message) });
      if (message.type !== 'text' && sent?.message_id) openKeyboards.set(chatId, sent.message_id);
      if (voice && synthesizer && message.body) await sendVoice(chatId, message);
    },

    /** "Escribiendo…" / "Grabando audio…" mientras el asistente trabaja. */
    async typing(phone, action = 'typing') {
      const chatId = links.chatFor(phone);
      if (chatId) await api.call('sendChatAction', { chat_id: chatId, action });
    },

    /** Borra del chat un mensaje con datos sensibles (el PIN). */
    async hide(incoming) {
      const ref = incoming.ref;
      if (!ref?.chatId || !ref?.messageId) return;
      await api.call('deleteMessage', { chat_id: ref.chatId, message_id: ref.messageId });
    },

    /** Descarga una foto o nota de voz recibida (dos pasos: getFile y luego el archivo). */
    async download(fileId) {
      const file = await api.call('getFile', { file_id: fileId });
      if (file.file_size && file.file_size > MAX_MEDIA_BYTES) throw new Error(`Archivo demasiado grande (${file.file_size} bytes)`);
      if (!file.file_path) throw new Error('Telegram no devolvió la ruta del archivo');
      const buffer = await api.downloadFile(file.file_path, MAX_MEDIA_BYTES);
      const ext = file.file_path.split('.').pop()?.toLowerCase();
      return { buffer, mimeType: MIME_BY_EXT[ext] ?? 'application/octet-stream' };
    },
  };
}
