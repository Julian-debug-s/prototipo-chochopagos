import { loadConfig } from '../src/config.js';
import { buildContainer } from '../src/container.js';
import { createConsoleGateway } from '../src/infrastructure/messaging/consoleGateway.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const ROSA = '573128889900';
export const JAIRO = '573104567890';

export function testConfig(extra = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: ':memory:',
    MEDIA_DIR: mkdtempSync(join(tmpdir(), 'chocho-media-')),
    LOG_LEVEL: 'silent',
    OCR_ENABLED: 'false',
    SEED_DEMO: 'true',
    AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    ...extra,
  });
}

/** Contenedor real con base en memoria y mensajería falsa que guarda lo enviado. */
export function buildTestContainer({ env, ...overrides } = {}) {
  const messaging = createConsoleGateway();
  const c = buildContainer(testConfig(env), { messaging, ...overrides });
  return { c, messaging };
}

let seq = 0;
export const textMsg = (from, text) => ({ messageId: `m${++seq}`, from, type: 'text', text });
export const replyMsg = (from, replyId) => ({ messageId: `m${++seq}`, from, type: 'reply', replyId, text: replyId });
export const imageMsg = (from) => ({ messageId: `m${++seq}`, from, type: 'image', text: '', media: { id: 'media-1', mimeType: 'image/jpeg' } });

/** Envía una secuencia de mensajes y devuelve las respuestas del último. */
export async function chat(c, ...messages) {
  let last = [];
  for (const m of messages) last = await c.conversation.handle(m);
  return last;
}

/** Concatena el texto visible de las respuestas (útil para aserciones). */
export const bodies = (replies) => replies.map((r) => r.body).join('\n---\n');
export const buttonIds = (replies) => replies.flatMap((r) => r.buttons?.map((b) => b.id) ?? r.sections?.flatMap((s) => s.rows.map((x) => x.id)) ?? []);

/** Pedido de agua escrito a mano: proveedor → escribir datos → referencia → valor. */
export const waterOrderMessages = (phone) => [
  textMsg(phone, 'pagar el agua'), replyMsg(phone, 'prov:0'), replyMsg(phone, 'mode:form'),
  textMsg(phone, '889900'), textMsg(phone, '42300'),
];
export const audioMsg = (from) => ({ messageId: `m${++seq}`, from, type: 'audio', media: { id: 'voice-1', mimeType: 'audio/ogg' } });
