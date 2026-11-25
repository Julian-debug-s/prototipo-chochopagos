/**
 * Notas de voz → texto. Descarga el audio del canal y lo transcribe.
 * Nunca lanza: si algo falla, devuelve null y el asistente pide repetir o escribir.
 *
 * @param {{
 *   mediaDownloader: { download(mediaId: string): Promise<{ buffer: Buffer, mimeType: string }> },
 *   transcriber: { transcribe(buffer: Buffer): Promise<string> } | null,
 *   logger: import('../shared/logger.js').Logger,
 * }} deps
 */
export function createVoiceService({ mediaDownloader, transcriber, logger }) {
  return {
    /** @returns {Promise<string|null>} */
    async toText(media) {
      if (!transcriber || !media?.id) return null;
      const started = Date.now();
      try {
        const { buffer } = await mediaDownloader.download(media.id);
        const text = (await transcriber.transcribe(buffer)).trim();
        logger.info('voice_transcribed', { ms: Date.now() - started, chars: text.length });
        return text || null;
      } catch (error) {
        logger.warn('voice_transcription_failed', { error: error.message });
        return null;
      }
    },
  };
}
