/**
 * Recibe los mensajes de Telegram con long polling (getUpdates): el servidor le
 * pregunta a Telegram si hay mensajes nuevos. No necesita URL pública, túnel ni
 * HTTPS, así que funciona igual en un computador local.
 *
 * @param {{
 *   api: import('./botApi.js').BotApi,
 *   onUpdate: (update: object) => Promise<void>,
 *   logger: import('../../shared/logger.js').Logger,
 *   timeoutSeconds?: number,
 * }} deps
 */
export function createTelegramPoller({ api, onUpdate, logger, timeoutSeconds = 20 }) {
  let offset = 0;
  let running = false;
  let controller = null;
  let loop = null;
  const inflight = new Set();

  const pause = (ms) => new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    controller?.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });

  async function run() {
    let failures = 0;
    while (running) {
      try {
        // Telegram responde a más tardar en `timeoutSeconds`. Si pasan 5 s más sin
        // respuesta, la conexión quedó muerta (Wi-Fi que se cae, router que corta
        // conexiones inactivas): se aborta y se abre otra enseguida.
        const updates = await api.call(
          'getUpdates',
          { offset, timeout: timeoutSeconds, allowed_updates: ['message', 'callback_query'] },
          { signal: controller.signal, timeoutMs: (timeoutSeconds + 5) * 1000 },
        );
        if (failures) logger.info('telegram_poll_recovered', { after: failures });
        failures = 0;
        for (const update of updates) {
          offset = update.update_id + 1; // confirma el update en la siguiente consulta
          const task = onUpdate(update).catch((error) => logger.error('telegram_update_failed', { updateId: update.update_id, error }));
          inflight.add(task);
          task.finally(() => inflight.delete(task));
        }
      } catch (error) {
        if (!running) break;
        if (error.status === 401 || error.status === 404) {
          logger.error('telegram_token_invalid', { hint: 'Revisa TELEGRAM_BOT_TOKEN en .env' });
          running = false;
          break;
        }
        failures++;
        if (error.status === 409) {
          logger.warn('telegram_conflict', { hint: '¿Hay otro servidor usando el mismo bot?' });
          await pause(3000);
        } else if (error.name === 'TimeoutError' && failures === 1) {
          // Conexión colgada: se reintenta de inmediato, sin esperar.
          logger.info('telegram_poll_retry', { reason: 'sin respuesta de Telegram, reconectando' });
        } else {
          logger.warn('telegram_poll_failed', { attempt: failures, error: error.message, cause: error.cause?.code, hint: '¿Hay conexión a internet?' });
          await pause(Math.min(1000 * failures, 5000));
        }
      }
    }
  }

  return {
    /** Valida el token, desactiva cualquier webhook previo y empieza a escuchar. @returns {Promise<{ username: string }>} */
    async start() {
      const me = await api.call('getMe');
      await api.call('deleteWebhook', { drop_pending_updates: false });
      running = true;
      controller = new AbortController();
      loop = run();
      return me;
    },

    async stop() {
      running = false;
      controller?.abort();
      await loop;
      const pending = Promise.allSettled([...inflight]);
      await Promise.race([pending, new Promise((r) => setTimeout(r, 5000).unref())]);
    },
  };
}
