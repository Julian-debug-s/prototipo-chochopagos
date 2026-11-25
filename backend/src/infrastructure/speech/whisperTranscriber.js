import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPythonWorker } from '../python/pythonWorker.js';

const SCRIPT = fileURLToPath(new URL('../../../python/stt_worker.py', import.meta.url));

/**
 * Voz → texto con faster-whisper en local (puerto `transcriber`).
 * @param {{ python: string, modelDir: string, threads: number, logger: import('../../shared/logger.js').Logger }} options
 */
export function createWhisperTranscriber({ python, modelDir, threads, logger }) {
  const worker = createPythonWorker({
    name: 'whisper',
    python,
    script: SCRIPT,
    env: { WHISPER_MODEL_DIR: modelDir, WHISPER_THREADS: String(threads || 0) },
    logger,
  });

  return {
    warmUp: () => worker.warmUp(),

    /** @param {Buffer} buffer audio en cualquier formato que entienda ffmpeg (OGG/Opus de Telegram, WAV, MP3…) */
    async transcribe(buffer) {
      const dir = await mkdtemp(join(tmpdir(), 'chocho-stt-'));
      try {
        const path = join(dir, 'audio');
        await writeFile(path, buffer, { mode: 0o600 });
        const { text } = await worker.request({ path });
        return String(text ?? '').trim();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },

    close: () => worker.close(),
  };
}
