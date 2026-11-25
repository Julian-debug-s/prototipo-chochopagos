import { randomInt } from 'node:crypto';
import { createLogger } from './shared/logger.js';
import { createEventBus } from './shared/eventBus.js';
import { createTokenService } from './shared/security.js';
import { openDatabase } from './infrastructure/db/database.js';
import { seedDemoData, wipeAllData } from './infrastructure/db/seed.js';
import { createUserRepository } from './infrastructure/repositories/userRepository.js';
import { createOrderRepository } from './infrastructure/repositories/orderRepository.js';
import { createLedgerRepository } from './infrastructure/repositories/ledgerRepository.js';
import { createTopUpRepository } from './infrastructure/repositories/topUpRepository.js';
import { createSessionRepository, createInboxRepository, createTranscriptRepository } from './infrastructure/repositories/chatRepositories.js';
import { createTelegramLinkRepository } from './infrastructure/repositories/telegramLinkRepository.js';
import { createBotApi } from './infrastructure/telegram/botApi.js';
import { createTelegramGateway } from './infrastructure/telegram/telegramGateway.js';
import { createTelegramUpdateHandler } from './infrastructure/telegram/updateHandler.js';
import { createConsoleGateway } from './infrastructure/messaging/consoleGateway.js';
import { createWhisperTranscriber } from './infrastructure/speech/whisperTranscriber.js';
import { createKokoroSynthesizer } from './infrastructure/speech/kokoroSynthesizer.js';
import { createVoiceService } from './application/voiceService.js';
import { createTesseractReceiptReader, createNullReceiptReader } from './infrastructure/ocr/receiptReaders.js';
import { createLocalMediaStore } from './infrastructure/storage/localMediaStore.js';
import { createSimulatedPaymentProvider } from './infrastructure/payments/simulatedPaymentProvider.js';
import { createUserService } from './application/userService.js';
import { createAuthService } from './application/authService.js';
import { createOrderService } from './application/orderService.js';
import { createFinanceService } from './application/financeService.js';
import { registerNotifications } from './application/notificationService.js';
import { createReceiptService } from './application/receiptService.js';
import { createConversationService } from './application/conversation/conversationService.js';
import { createChatService } from './application/chatService.js';
import { createInboundProcessor } from './application/inboundProcessor.js';

/**
 * Raíz de composición (inyección de dependencias manual).
 * Es el ÚNICO lugar que conoce las implementaciones concretas; todo lo demás
 * recibe sus dependencias por parámetro, lo que permite cambiar SQLite, Telegram u
 * OCR sin tocar la lógica, y usar dobles de prueba en los tests.
 *
 * @param {import('./config.js').Config} config
 * @param {{ logger?: any, clock?: () => Date, messaging?: any, receiptReader?: any, mediaDownloader?: any, paymentProvider?: any, telegramApi?: any, transcriber?: any, synthesizer?: any }} [overrides]
 */
export function buildContainer(config, overrides = {}) {
  const logger = overrides.logger ?? createLogger({ level: config.logLevel });
  const clock = overrides.clock ?? (() => new Date());

  // ---------------------------------------------------------------- infraestructura
  const database = openDatabase(config.databasePath);
  const repos = {
    users: createUserRepository(database),
    orders: createOrderRepository(database),
    ledger: createLedgerRepository(database),
    topUps: createTopUpRepository(database),
    sessions: createSessionRepository(database),
    inbox: createInboxRepository(database),
    transcript: createTranscriptRepository(database),
    telegramLinks: createTelegramLinkRepository(database),
  };

  const { stt, tts } = config.speech;
  const transcriber = overrides.transcriber !== undefined ? overrides.transcriber : stt ? createWhisperTranscriber({ ...stt, logger }) : null;
  const synthesizer = overrides.synthesizer !== undefined ? overrides.synthesizer : tts ? createKokoroSynthesizer({ ...tts, logger }) : null;

  const telegramApi = overrides.telegramApi ?? (config.telegram.enabled ? createBotApi({ token: config.telegram.botToken }) : null);
  const channelGateway = telegramApi
    ? createTelegramGateway({ api: telegramApi, links: repos.telegramLinks, synthesizer, logger })
    : createConsoleGateway({ logger });
  const messaging = overrides.messaging ?? channelGateway;
  const mediaDownloader = overrides.mediaDownloader ?? channelGateway;
  const receiptReader = overrides.receiptReader ?? (config.ocrEnabled ? createTesseractReceiptReader({ logger }) : createNullReceiptReader());
  const mediaStore = createLocalMediaStore({ dir: config.mediaDir });
  const paymentProvider = overrides.paymentProvider ?? createSimulatedPaymentProvider();
  const events = createEventBus(logger);
  const tokens = createTokenService({ secret: config.auth.secret, clock });

  // ---------------------------------------------------------------- aplicación
  const userService = createUserService({ users: repos.users, clock, sectors: config.sectors });
  const authService = createAuthService({ userService, tokens, staff: config.auth, clock });
  const orderService = createOrderService({
    database, ...repos, events, paymentProvider, clock, deliveryFee: config.deliveryFee,
    generateDeliveryCode: () => String(randomInt(1000, 10000)),
    checkPin: userService.checkPin,
  });
  const financeService = createFinanceService({ database, ...repos, events, clock, initialPaperSheets: config.paperSheets });
  const receiptService = createReceiptService({ mediaDownloader, mediaStore, receiptReader, logger });
  const conversation = createConversationService({
    userService, orderService, financeService, sessions: repos.sessions, receipts: receiptService, clock, logger,
    config: { sessionTtlMinutes: config.sessionTtlMinutes, sectors: config.sectors, operatorName: config.operatorName },
  });
  const voice = transcriber ? createVoiceService({ mediaDownloader, transcriber, logger }) : null;
  const chat = createChatService({ conversation, transcript: repos.transcript, messaging, voice, clock, logger });
  const inbound = createInboundProcessor({ inbox: repos.inbox, chat, clock, logger });
  // Solo existe si hay bot configurado. server.js le conecta el poller.
  const telegram = telegramApi
    ? { api: telegramApi, updates: createTelegramUpdateHandler({ api: telegramApi, links: repos.telegramLinks, inbound, clock, logger }), username: null }
    : null;

  registerNotifications({ events, notify: chat.notify, operatorName: config.operatorName });

  const seed = () => seedDemoData({ database, ...repos, clock });
  if (config.seedDemo && seed()) logger.info('demo_data_seeded');
  if (config.auth.secretIsEphemeral && !config.isProduction) logger.warn('auth_secret_ephemeral', { hint: 'Define AUTH_SECRET en .env para que las sesiones sobrevivan reinicios' });

  return {
    config, logger, clock, database, repos, events, messaging, mediaStore,
    userService, authService, orderService, financeService, conversation, chat, inbound, telegram, transcriber, synthesizer,

    /** "Reiniciar demo": borra todo y vuelve a cargar los datos de ejemplo. */
    resetDemo() {
      wipeAllData(database);
      seed();
    },

    async close() {
      await receiptReader.close?.();
      transcriber?.close?.();
      synthesizer?.close?.();
      database.close();
    },
  };
}

/** @typedef {ReturnType<typeof buildContainer>} Container */
