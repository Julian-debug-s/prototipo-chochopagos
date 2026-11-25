/**
 * Cliente mínimo de la Telegram Bot API.
 * Docs: https://core.telegram.org/bots/api
 *
 * El token va en la URL: nunca se registra la URL en los logs.
 */

const API = 'https://api.telegram.org';

export class TelegramApiError extends Error {
  constructor(method, status, description) {
    super(`Telegram ${method} ${status}: ${description ?? 'sin detalle'}`);
    this.name = 'TelegramApiError';
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{ token: string, fetchImpl?: typeof fetch, retries?: number }} options
 */
export function createBotApi({ token, fetchImpl = fetch, retries = 2 }) {
  /**
   * Llama un método de la API y devuelve `result`.
   * @param {string} method
   * @param {object} [params]
   * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
   */
  async function call(method, params = {}, { signal, timeoutMs = 15_000 } = {}, attempt = 0) {
    const signals = [AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])];
    const response = await fetchImpl(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.any(signals),
    });
    const data = await response.json().catch(() => null);
    // Reintenta solo errores transitorios. Telegram indica cuánto esperar en retry_after.
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      const wait = data?.parameters?.retry_after ? data.parameters.retry_after * 1000 : 500 * 2 ** attempt;
      await sleep(Math.min(wait, 10_000));
      return call(method, params, { signal, timeoutMs }, attempt + 1);
    }
    if (!data?.ok) throw new TelegramApiError(method, response.status, data?.description);
    return data.result;
  }

  /**
   * Sube un archivo (multipart), p. ej. sendVoice.
   * @param {string} method @param {Record<string, string|number>} params
   * @param {{ field: string, buffer: Buffer, filename: string, type: string }} file
   */
  async function upload(method, params, file) {
    const form = new FormData();
    for (const [key, value] of Object.entries(params)) form.append(key, String(value));
    form.append(file.field, new Blob([file.buffer], { type: file.type }), file.filename);
    const response = await fetchImpl(`${API}/bot${token}/${method}`, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
    const data = await response.json().catch(() => null);
    if (!data?.ok) throw new TelegramApiError(method, response.status, data?.description);
    return data.result;
  }

  /** Descarga un archivo a partir del `file_path` que devuelve getFile. */
  async function downloadFile(filePath, maxBytes) {
    const response = await fetchImpl(`${API}/file/bot${token}/${filePath}`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new TelegramApiError('downloadFile', response.status);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('Archivo demasiado grande');
    return buffer;
  }

  return { call, upload, downloadFile };
}

/** @typedef {ReturnType<typeof createBotApi>} BotApi */
