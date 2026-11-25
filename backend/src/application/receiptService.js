import { parseReceiptText } from '../nlp/text.js';

/**
 * Obtiene la foto del recibo, la guarda y extrae sus datos con OCR.
 * Acepta dos orígenes:
 *  - { id, mimeType }  foto llegada por Telegram (se descarga del bot)
 *  - { stored }        foto subida desde la app web (ya está guardada)
 * Nunca lanza: si algo falla, el bot pide los datos a mano.
 *
 * @param {{
 *   mediaDownloader: { download(mediaId: string): Promise<{ buffer: Buffer, mimeType: string }> },
 *   mediaStore: { save(buffer: Buffer, mimeType: string): Promise<string>, read(name: string): Promise<Buffer> },
 *   receiptReader: { read(buffer: Buffer): Promise<string|null> },
 *   logger: import('../shared/logger.js').Logger,
 * }} deps
 */
export function createReceiptService({ mediaDownloader, mediaStore, receiptReader, logger }) {
  async function obtain(media) {
    if (media?.stored) return { receiptPath: media.stored, buffer: await mediaStore.read(media.stored) };
    const { buffer, mimeType } = await mediaDownloader.download(media.id);
    return { receiptPath: await mediaStore.save(buffer, mimeType), buffer };
  }

  return {
    async process(media) {
      let receiptPath = null;
      try {
        const file = await obtain(media);
        receiptPath = file.receiptPath;
        const rawText = await receiptReader.read(file.buffer);
        return { receiptPath, reading: rawText ? parseReceiptText(rawText) : null };
      } catch (error) {
        logger.warn('receipt_processing_failed', { media, error });
        return { receiptPath, reading: null };
      }
    },
  };
}
