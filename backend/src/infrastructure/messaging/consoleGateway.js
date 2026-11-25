/**
 * Implementación de desarrollo del puerto de mensajería: no llama a Telegram,
 * imprime en el log y guarda los mensajes en memoria para que /dev/simulate
 * y las pruebas puedan leerlos.
 */
export function createConsoleGateway({ logger, keep = 50 } = {}) {
  /** @type {Map<string, object[]>} */
  const outbox = new Map();

  return {
    async send(to, message) {
      const list = outbox.get(to) ?? [];
      list.push(message);
      if (list.length > keep) list.shift();
      outbox.set(to, list);
      logger?.info('console_send', { to, message });
    },

    async download() {
      throw new Error('La descarga de archivos requiere TELEGRAM_BOT_TOKEN');
    },

    /** Saca y devuelve los mensajes pendientes para un número. */
    drain(to) {
      const list = outbox.get(to) ?? [];
      outbox.delete(to);
      return list;
    },
  };
}
