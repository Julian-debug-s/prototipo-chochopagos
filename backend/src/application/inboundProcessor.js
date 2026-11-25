/**
 * Mensajes que llegan del bot de Telegram:
 *  1. Descarta duplicados (un update puede repetirse si el servidor se reinicia a mitad).
 *  2. Los pasa al servicio de chat, que los procesa en orden por número.
 *
 * @param {{
 *   inbox: { markReceived(id: string, phone: string, now: Date): boolean },
 *   chat: ReturnType<typeof import('./chatService.js').createChatService>,
 *   clock: () => Date,
 *   logger: import('../shared/logger.js').Logger,
 * }} deps
 */
export function createInboundProcessor({ inbox, chat, clock, logger }) {
  async function processOne(message) {
    if (!inbox.markReceived(message.messageId, message.from, clock())) {
      logger.debug('duplicate_message_ignored', { messageId: message.messageId });
      return;
    }
    await chat.converse(message, 'telegram');
  }

  return {
    /** @param {import('./conversation/conversationService.js').IncomingMessage[]} messages */
    async process(messages) {
      const results = await Promise.allSettled(messages.map(processOne));
      for (const r of results) if (r.status === 'rejected') logger.error('inbound_processing_failed', { error: r.reason });
    },
  };
}
