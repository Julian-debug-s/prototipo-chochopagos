const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/**
 * Logger estructurado mínimo (una línea JSON por evento), sin dependencias.
 * @param {{ level?: keyof LEVELS, bindings?: Record<string, unknown>, sink?: (line: string) => void }} [options]
 */
export function createLogger({ level = 'info', bindings = {}, sink = (line) => process.stdout.write(line + '\n') } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const log = (lvl) => (msg, fields = {}) => {
    if (LEVELS[lvl] < threshold) return;
    const entry = { time: new Date().toISOString(), level: lvl, msg, ...bindings, ...serialize(fields) };
    sink(JSON.stringify(entry));
  };

  return {
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child: (extra) => createLogger({ level, bindings: { ...bindings, ...extra }, sink }),
  };
}

function serialize(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = value instanceof Error ? { name: value.name, message: value.message, code: value.code, stack: value.stack } : value;
  }
  return out;
}

/** @typedef {ReturnType<typeof createLogger>} Logger */
