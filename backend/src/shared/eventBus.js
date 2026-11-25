/**
 * Bus de eventos en proceso (patrón Observer).
 * Desacopla los casos de uso (que publican "order.statusChanged") de los efectos
 * secundarios (notificar por Telegram). Un suscriptor que falla no afecta a los demás
 * ni a quien publicó.
 */
export function createEventBus(logger) {
  /** @type {Map<string, Set<(payload: any) => unknown>>} */
  const handlers = new Map();

  return {
    subscribe(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
      return () => handlers.get(type)?.delete(handler);
    },

    /** Publica y espera a todos los suscriptores; nunca lanza. */
    async publish(type, payload) {
      const subs = [...(handlers.get(type) ?? [])];
      await Promise.all(
        subs.map(async (handler) => {
          try {
            await handler(payload);
          } catch (error) {
            logger?.error('event_handler_failed', { event: type, error });
          }
        }),
      );
    },
  };
}

/** @typedef {ReturnType<typeof createEventBus>} EventBus */
