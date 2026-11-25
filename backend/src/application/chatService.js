import { createKeyedMutex } from '../shared/keyedMutex.js';
import { text } from './conversation/messages.js';

/**
 * Punto único de entrada a la conversación, para cualquier canal:
 *  - 'telegram': mensajes del bot.
 *  - 'web':      chat de la pestaña Usuario.
 *
 * Ambos canales comparten sesión e historial por número de celular, y todo se
 * refleja en los dos lados:
 *  - Lo que pasa en Telegram queda en el historial, que la app lee.
 *  - Lo que pasa en la app también se envía a Telegram (si la persona vinculó su
 *    número), con una marca "Desde la app" para su propio mensaje.
 *
 * @param {{
 *   conversation: ReturnType<typeof import('./conversation/conversationService.js').createConversationService>,
 *   transcript: ReturnType<typeof import('../infrastructure/repositories/chatRepositories.js').createTranscriptRepository>,
 *   messaging: {
 *     send(to: string, message: object, options?: { voice?: boolean }): Promise<void>,
 *     hide?(incoming: object): Promise<void>,
 *     typing?(to: string, action?: string): Promise<void>,
 *   },
 *   voice?: ReturnType<typeof import('./voiceService.js').createVoiceService> | null,
 *   clock: () => Date,
 *   logger: import('../shared/logger.js').Logger,
 * }} deps
 */
export function createChatService({ conversation, transcript, messaging, voice = null, clock, logger }) {
  const mutex = createKeyedMutex();
  // Cola de salida por número: los mensajes llegan a Telegram en orden, y la app
  // no espera a Telegram para mostrar su respuesta.
  const outbox = createKeyedMutex();

  // Pasos en los que la persona escribe su PIN: nunca se guarda en el historial.
  const SECRET_STEPS = new Set(['pin', 'register.pin', 'register.pinConfirm']);

  const describeInbound = (m, secret) =>
    m.type === 'image'
      ? { type: 'image', body: m.text || '📷 Foto del recibo', media: m.media?.stored ?? null }
      : secret
        ? { type: 'text', body: '••••', secret: true, ...(m.spoken ? { voice: true } : {}) }
        : m.spoken
          ? { type: 'text', body: `🎤 ${m.text}`, voice: true }
          : m.type === 'audio'
            ? { type: 'text', body: '🎤 Nota de voz', voice: true }
            : { type: 'text', body: m.text || m.replyId || '' };

  /** Envía por Telegram en orden. Devuelve una promesa que nunca falla. */
  function push(phone, message, options) {
    return outbox.run(phone, async () => {
      try {
        await messaging.send(phone, message, options);
      } catch (error) {
        logger.warn('telegram_send_failed', { to: phone, error: error.message });
      }
    });
  }

  function deliver(phone, channel, message, options = {}) {
    transcript.append(phone, 'out', channel, message, clock());
    return push(phone, message, options);
  }

  /** Nota de voz → texto (dentro del turno de la persona, para respetar el orden). */
  async function listen(message) {
    if (message.type !== 'audio' || !voice) return message;
    messaging.typing?.(message.from).catch(() => {});
    const heard = await voice.toText(message.media);
    return heard ? { ...message, type: 'text', text: heard, spoken: true } : message;
  }

  return {
    /**
     * Procesa un mensaje del cliente (en orden por número) y devuelve las respuestas.
     * @param {import('./conversation/conversationService.js').IncomingMessage} message
     * @param {'telegram'|'web'} channel
     */
    converse(message, channel) {
      return mutex.run(message.from, async () => {
        const phone = message.from;
        if (channel === 'telegram') messaging.typing?.(phone).catch(() => {});
        const incoming = await listen(message);

        const secret = SECRET_STEPS.has(conversation.currentStep(phone)) && incoming.type === 'text';
        const shown = describeInbound(incoming, secret);
        transcript.append(phone, 'in', channel, shown, clock());

        if (channel === 'web') {
          // Telegram ve lo que la persona hizo en la app (sin repetir el PIN).
          push(phone, text(`🖥️ _Desde la app:_ ${shown.body}`));
        } else if (secret) {
          // En Telegram el bot borra del chat el mensaje con el PIN.
          messaging.hide?.(message).catch((error) => logger.warn('secret_message_not_hidden', { error: error.message }));
        }

        // Si la persona habló por Telegram, también se le responde con voz.
        const options = { voice: channel === 'telegram' && message.type === 'audio' };
        const replies = [];
        const emit = async (reply) => {
          replies.push(reply);
          const sending = deliver(phone, channel, reply, options);
          // En Telegram se espera a que salga; la app no depende de Telegram para responder
          // (la cola de salida mantiene el orden igual).
          if (channel === 'telegram') await sending;
        };
        const final = await conversation.handle(incoming, { sendNow: emit, channel });
        for (const reply of final) await emit(reply);
        return replies;
      });
    },

    /** Aviso iniciado por el negocio (estado del pedido): sale por Telegram y queda en el historial. */
    notify: (phone, message) => deliver(phone, 'telegram', message),

    history: (phone, options) => transcript.list(phone, options),

    step: (phone) => conversation.currentStep(phone),
  };
}
