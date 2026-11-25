import { parseUpdate } from './updates.js';
import { normalizeColombianMobile } from '../../domain/phone.js';

const TEXTS = {
  askContact: '👋 ¡Hola! Soy <b>ChochoPagos</b>.\n\nPara atenderte necesito tu número de celular. Toca el botón <b>📱 Compartir mi número</b> de abajo.',
  contactButton: '📱 Compartir mi número',
  notOwnContact: 'Ese no es tu número. Toca el botón <b>📱 Compartir mi número</b> para enviar el tuyo.',
  notColombian: 'Por ahora solo atendemos celulares de Colombia (3XX XXX XXXX).',
  linked: '✅ Listo, ya te reconozco.',
};

/**
 * Recibe cada `Update` de Telegram (por long polling) y lo entrega al asistente.
 *
 * Telegram no dice el celular de la persona, y en ChochoPagos todo se identifica
 * por celular. Por eso, la primera vez se pide compartir el contacto y se guarda
 * el vínculo chat ↔ celular. Desde ahí, Telegram y la app comparten historial.
 *
 * @param {{
 *   api: import('./botApi.js').BotApi,
 *   links: ReturnType<typeof import('../repositories/telegramLinkRepository.js').createTelegramLinkRepository>,
 *   inbound: ReturnType<typeof import('../../application/inboundProcessor.js').createInboundProcessor>,
 *   clock: () => Date,
 *   logger: import('../../shared/logger.js').Logger,
 * }} deps
 */
export function createTelegramUpdateHandler({ api, links, inbound, clock, logger }) {
  const say = (chatId, text, extra = {}) => api.call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
  const quietly = (promise, what) => promise.catch((error) => logger.debug('telegram_call_failed', { what, error }));

  const askContact = (chatId, text = TEXTS.askContact) =>
    say(chatId, text, { reply_markup: { keyboard: [[{ text: TEXTS.contactButton, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });

  async function linkContact(u) {
    if (!u.ownContact) return askContact(u.chatId, TEXTS.notOwnContact);
    const phone = normalizeColombianMobile(u.phone);
    if (!phone) return say(u.chatId, TEXTS.notColombian, { reply_markup: { remove_keyboard: true } });

    links.link(u.chatId, phone, clock());
    logger.info('telegram_linked', { phone });
    await say(u.chatId, TEXTS.linked, { reply_markup: { remove_keyboard: true } });
    // Arranca la conversación como si hubiera escrito "hola": saludo o registro.
    await inbound.process([{ messageId: `tg:${u.updateId}`, from: phone, type: 'text', text: 'hola' }]);
  }

  return {
    /**
     * Importante: hasta llamar a `inbound.process` no hay ningún `await`. Así,
     * aunque el poller no espere a cada update, los mensajes de una misma
     * persona entran al asistente en el orden en que llegaron.
     */
    async handle(update) {
      const u = parseUpdate(update);
      if (!u) return;

      if (u.kind === 'callback') {
        // Quita el "cargando" del botón y los botones del mensaje (evita tocarlos dos veces).
        quietly(api.call('answerCallbackQuery', { callback_query_id: u.callbackId }), 'answerCallbackQuery');
        quietly(api.call('editMessageReplyMarkup', { chat_id: u.chatId, message_id: u.messageId, reply_markup: { inline_keyboard: [] } }), 'editMessageReplyMarkup');
      }

      if (u.kind === 'contact') return linkContact(u);

      const phone = links.phoneFor(u.chatId);
      if (!phone) return askContact(u.chatId);

      await inbound.process([{
        messageId: `tg:${u.updateId}`,
        from: phone,
        ...u.content,
        ref: { chatId: u.chatId, messageId: u.messageId },
      }]);
    },
  };
}
