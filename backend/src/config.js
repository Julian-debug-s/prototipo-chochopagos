import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { homedir } from 'node:os';

/** Rutas relativas a la carpeta backend/ (no a donde se lance el proceso); admite "~/". */
const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url));
const resolve = (p) => resolvePath(BACKEND_DIR, p.replace(/^~(?=\/)/, homedir()));

const DEFAULT_PROTOTYPE_DIR = fileURLToPath(new URL('../..', import.meta.url));

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().default('./data/chochopagos.db'),
  MEDIA_DIR: z.string().default('./data/media'),
  SEED_DEMO: bool.default(true),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),

  AUTH_SECRET: z.preprocess((v) => v || undefined, z.string().min(32, 'AUTH_SECRET debe tener al menos 32 caracteres').optional()),
  OPERATOR_ID: z.string().default('OP-01'),
  OPERATOR_PIN: z.string().regex(/^\d{4}$/, 'OPERATOR_PIN debe tener 4 dígitos').default('1234'),
  OPERATOR_NAME: z.string().default('Carlos'),
  CENTER_ID: z.string().default('CC-01'),
  CENTER_PIN: z.string().regex(/^\d{4}$/, 'CENTER_PIN debe tener 4 dígitos').default('1234'),
  PROTOTYPE_DIR: z.string().default(DEFAULT_PROTOTYPE_DIR),
  PAPER_SHEETS: z.coerce.number().int().nonnegative().default(120),

  TELEGRAM_BOT_TOKEN: z.string().trim().regex(/^(\d+:[\w-]{20,})?$/, 'TELEGRAM_BOT_TOKEN no tiene el formato que entrega @BotFather (123456:ABC...)').default(''),

  // Voz local. Vacío = desactivado.
  WHISPER_PYTHON: z.string().trim().default(''),
  WHISPER_MODEL_DIR: z.string().trim().default(''),
  WHISPER_THREADS: z.coerce.number().int().nonnegative().default(0),
  KOKORO_PYTHON: z.string().trim().default(''),
  KOKORO_VOICE: z.string().trim().default('ef_dora'),
  KOKORO_SPEED: z.coerce.number().min(0.5).max(2).default(1),
  FFMPEG_PATH: z.string().trim().default('ffmpeg'),

  OCR_ENABLED: bool.default(true),
  DELIVERY_FEE: z.coerce.number().int().nonnegative().default(3000),
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  SECTORS: z.string().default('Alto del Chocho,Vereda vecina'),
});

/**
 * Lee y valida variables de entorno. Falla al arrancar (no a mitad de una
 * petición) si falta algo obligatorio.
 */
export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${issues}\nRevisa tu archivo .env (usa .env.example como guía).`);
  }
  const e = parsed.data;

  const telegramEnabled = Boolean(e.TELEGRAM_BOT_TOKEN);
  if (e.NODE_ENV === 'production') {
    if (!telegramEnabled) throw new Error('En producción se requiere TELEGRAM_BOT_TOKEN');
    if (!e.AUTH_SECRET) throw new Error('En producción se requiere AUTH_SECRET');
    if (e.OPERATOR_PIN === '1234' || e.CENTER_PIN === '1234') throw new Error('En producción cambia OPERATOR_PIN y CENTER_PIN');
  }

  return Object.freeze({
    env: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    port: e.PORT,
    databasePath: e.DATABASE_PATH,
    mediaDir: e.MEDIA_DIR,
    seedDemo: e.SEED_DEMO,
    logLevel: e.LOG_LEVEL,
    auth: {
      // Sin AUTH_SECRET (solo en desarrollo) se genera uno al azar: las sesiones se cierran al reiniciar.
      secret: e.AUTH_SECRET ?? randomBytes(32).toString('hex'),
      secretIsEphemeral: !e.AUTH_SECRET,
      operator: { id: e.OPERATOR_ID, pin: e.OPERATOR_PIN, name: e.OPERATOR_NAME },
      center: { id: e.CENTER_ID, pin: e.CENTER_PIN },
    },
    prototypeDir: e.PROTOTYPE_DIR,
    paperSheets: e.PAPER_SHEETS,
    operatorName: e.OPERATOR_NAME,
    telegram: {
      enabled: telegramEnabled,
      botToken: e.TELEGRAM_BOT_TOKEN,
    },
    speech: {
      // Voz → texto (Whisper): notas de voz de Telegram.
      stt: e.WHISPER_PYTHON && e.WHISPER_MODEL_DIR
        ? { python: resolve(e.WHISPER_PYTHON), modelDir: resolve(e.WHISPER_MODEL_DIR), threads: e.WHISPER_THREADS }
        : null,
      // Texto → voz (Kokoro): respuestas en audio a quien habla por Telegram.
      tts: e.KOKORO_PYTHON
        ? { python: resolve(e.KOKORO_PYTHON), voice: e.KOKORO_VOICE, speed: e.KOKORO_SPEED, ffmpeg: e.FFMPEG_PATH }
        : null,
    },
    ocrEnabled: e.OCR_ENABLED,
    deliveryFee: e.DELIVERY_FEE,
    sessionTtlMinutes: e.SESSION_TTL_MINUTES,
    sectors: e.SECTORS.split(',').map((s) => s.trim()).filter(Boolean),
  });
}

/** @typedef {ReturnType<typeof loadConfig>} Config */
