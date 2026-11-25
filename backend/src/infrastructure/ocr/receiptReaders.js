/**
 * Implementaciones del puerto `receiptReader.read(buffer) -> texto | null`.
 */

/** OCR en el servidor con tesseract.js. El worker se crea una sola vez, al primer uso. */
export function createTesseractReceiptReader({ logger, language = 'spa', timeoutMs = 60_000 }) {
  let workerPromise = null;

  const getWorker = () => {
    workerPromise ??= import('tesseract.js')
      .then(({ createWorker }) => createWorker(language))
      .catch((error) => {
        workerPromise = null; // permite reintentar en el siguiente recibo
        throw error;
      });
    return workerPromise;
  };

  return {
    async read(buffer) {
      const worker = await getWorker();
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('OCR timeout')), timeoutMs).unref());
      const { data } = await Promise.race([worker.recognize(buffer), timeout]);
      logger.debug('ocr_done', { chars: data?.text?.length ?? 0, confidence: data?.confidence });
      return data?.text || null;
    },

    async close() {
      if (workerPromise) await (await workerPromise).terminate().catch(() => {});
    },
  };
}

/** Para cuando el OCR está apagado: el bot pedirá los datos a mano. */
export function createNullReceiptReader() {
  return { read: async () => null, close: async () => {} };
}
