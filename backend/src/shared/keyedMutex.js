/**
 * Serializa tareas asíncronas por clave. Se usa para procesar en orden los mensajes
 * de un mismo cliente de Telegram: si Rosa manda dos mensajes seguidos, el segundo
 * espera a que termine el primero y la sesión no queda en un estado inconsistente.
 */
export function createKeyedMutex() {
  /** @type {Map<string, Promise<unknown>>} */
  const tails = new Map();

  return {
    /**
     * @template T
     * @param {string} key
     * @param {() => Promise<T>} task
     * @returns {Promise<T>}
     */
    run(key, task) {
      const previous = tails.get(key) ?? Promise.resolve();
      const current = previous.catch(() => {}).then(task);
      const tail = current.catch(() => {});
      tails.set(key, tail);
      tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return current;
    },
  };
}
