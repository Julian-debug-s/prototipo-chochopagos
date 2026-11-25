import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * Proceso de Python persistente (Whisper, Kokoro). Carga el modelo una vez y
 * atiende pedidos por stdin/stdout, una línea JSON por mensaje (ver backend/python/).
 * Si el proceso muere, se vuelve a arrancar en el siguiente pedido.
 *
 * @param {{
 *   name: string,
 *   python: string,
 *   script: string,
 *   env?: Record<string, string>,
 *   logger: import('../../shared/logger.js').Logger,
 *   startTimeoutMs?: number,
 * }} options
 */
export function createPythonWorker({ name, python, script, env = {}, logger, startTimeoutMs = 180_000 }) {
  let child = null;
  let ready = null;
  let seq = 0;
  const pending = new Map();

  function failAll(error) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  }

  function start() {
    const started = Date.now();
    const proc = spawn(python, ['-I', script], {
      env: { ...process.env, HF_HUB_OFFLINE: '1', PYTHONUNBUFFERED: '1', ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child = proc;

    let stderrTail = '';
    proc.stderr.on('data', (chunk) => { stderrTail = (stderrTail + chunk).slice(-2000); });

    ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${name}: no cargó en ${startTimeoutMs / 1000} s`)), startTimeoutMs);
      createInterface({ input: proc.stdout }).on('line', (line) => {
        let msg;
        try { msg = JSON.parse(line); } catch { return; }
        if (msg.ready) {
          clearTimeout(timer);
          logger.info('python_worker_ready', { worker: name, seconds: Math.round((Date.now() - started) / 100) / 10 });
          return resolve();
        }
        const job = pending.get(msg.id);
        if (!job) return;
        pending.delete(msg.id);
        clearTimeout(job.timer);
        if (msg.ok) job.resolve(msg);
        else job.reject(new Error(`${name}: ${msg.error}`));
      });
      proc.on('error', (error) => { clearTimeout(timer); reject(error); });
      proc.on('exit', (code) => {
        clearTimeout(timer);
        const error = new Error(`${name}: el proceso terminó (código ${code}). ${stderrTail.trim().split('\n').slice(-3).join(' | ')}`);
        if (child === proc) { child = null; ready = null; }
        reject(error);
        failAll(error);
        if (code !== 0 && code !== null) logger.warn('python_worker_exited', { worker: name, code, stderr: stderrTail.slice(-500) });
      });
    });
    ready.catch(() => {}); // el error se reporta a quien haga el pedido
    return ready;
  }

  return {
    /** Arranca el proceso ya (para que el modelo esté cargado cuando llegue el primer audio). */
    warmUp() {
      return (ready ?? start()).catch((error) => logger.warn('python_worker_unavailable', { worker: name, error: error.message }));
    },

    /** @returns {Promise<object>} */
    async request(payload, timeoutMs = 120_000) {
      if (!child) start();
      await ready;
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${name}: sin respuesta en ${timeoutMs / 1000} s`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ ...payload, id }) + '\n');
      });
    },

    close() {
      failAll(new Error(`${name}: cerrado`));
      child?.stdin.end();
      child?.kill();
      child = null;
      ready = null;
    },
  };
}
