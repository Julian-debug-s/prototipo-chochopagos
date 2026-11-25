import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPythonWorker } from '../python/pythonWorker.js';

const run = promisify(execFile);
const SCRIPT = fileURLToPath(new URL('../../../python/tts_worker.py', import.meta.url));

/**
 * Texto → nota de voz con Kokoro en local (puerto `synthesizer`).
 * Kokoro entrega WAV; ffmpeg lo pasa a OGG/Opus, el formato de las notas de voz de Telegram.
 *
 * @param {{ python: string, voice: string, speed: number, ffmpeg: string, logger: import('../../shared/logger.js').Logger }} options
 */
export function createKokoroSynthesizer({ python, voice, speed, ffmpeg, logger }) {
  const worker = createPythonWorker({
    name: 'kokoro',
    python,
    script: SCRIPT,
    env: { KOKORO_VOICE: voice, KOKORO_SPEED: String(speed) },
    logger,
  });

  return {
    warmUp: () => worker.warmUp(),

    /** @returns {Promise<Buffer>} audio OGG/Opus */
    async synthesize(text) {
      const dir = await mkdtemp(join(tmpdir(), 'chocho-tts-'));
      try {
        const wav = join(dir, 'voz.wav');
        const ogg = join(dir, 'voz.ogg');
        await worker.request({ text, out: wav }, 60_000);
        await run(ffmpeg, ['-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', ogg], { timeout: 30_000 });
        return await readFile(ogg);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },

    close: () => worker.close(),
  };
}
