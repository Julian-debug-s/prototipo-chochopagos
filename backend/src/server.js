import { loadConfig } from './config.js';
import { buildContainer } from './container.js';
import { createApp } from './http/app.js';
import { createTelegramPoller } from './infrastructure/telegram/poller.js';

/** Punto de entrada: configura, compone, escucha y se apaga con orden. */
let container;
try {
  container = buildContainer(loadConfig());
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const { config, logger } = container;
const server = createApp(container).listen(config.port, () => {
  logger.info('server_started', {
    app: `http://localhost:${config.port}`,
    telegram: config.telegram.enabled ? 'bot activo (long polling)' : 'consola (sin token: usa POST /dev/simulate)',
    ocr: config.ocrEnabled,
    voz_a_texto: config.speech.stt ? 'whisper (local)' : 'desactivado',
    texto_a_voz: config.speech.tts ? `kokoro (${config.speech.tts.voice})` : 'desactivado',
  });
});

// Carga los modelos de voz de una vez, para que la primera nota de voz no espere.
container.transcriber?.warmUp?.();
container.synthesizer?.warmUp?.();

// Bot de Telegram: si el token falla, la app web sigue funcionando.
const poller = container.telegram
  ? createTelegramPoller({ api: container.telegram.api, onUpdate: container.telegram.updates.handle, logger })
  : null;
poller?.start()
  .then((me) => {
    container.telegram.username = me.username;
    logger.info('telegram_bot_ready', { bot: `@${me.username}`, link: `https://t.me/${me.username}` });
  })
  .catch((error) => logger.error('telegram_start_failed', { error: error.message, hint: 'Revisa TELEGRAM_BOT_TOKEN en .env' }));

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info('shutdown', { signal });
  setTimeout(() => process.exit(1), 10_000).unref();
  await poller?.stop();
  server.close(async () => {
    await container.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (error) => logger.error('unhandled_rejection', { error }));
