import express from 'express';
import { join } from 'node:path';
import { apiRoutes } from './routes/api.js';
import { devRoutes } from './routes/dev.js';
import { requestContext, securityHeaders, errorHandler } from './middleware.js';

/**
 * En desarrollo, permite abrir el prototipo desde otro servidor local
 * (Live Server, python -m http.server) y hablar con esta API.
 */
function localDevCors(req, res, next) {
  const origin = req.get('origin');
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST', Vary: 'Origin' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
}

/**
 * Fábrica de la app Express. No abre puertos: así las pruebas la usan sin red.
 * Sirve también el prototipo (index.html + assets) para que la app y la API
 * compartan origen.
 * @param {import('../container.js').Container} c
 */
export function createApp(c) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // detrás de ngrok / Cloudflare Tunnel / Render

  app.use(securityHeaders);
  app.use(requestContext(c.logger));
  if (!c.config.isProduction) app.use(localDevCors);
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', telegram: c.config.telegram.enabled ? 'bot' : 'console', time: new Date().toISOString() }));

  app.use('/api', apiRoutes(c));
  if (!c.config.isProduction) app.use('/dev', devRoutes(c));

  // Prototipo: solo estos archivos. Nunca se sirve la carpeta completa (contiene backend/.env).
  const root = c.config.prototypeDir;
  const file = (name) => (_req, res, next) => res.sendFile(join(root, name), (err) => err && next());
  app.get(['/', '/index.html'], file('index.html'));
  app.get('/manifest.webmanifest', file('manifest.webmanifest'));
  app.get('/sw.js', (_req, res, next) => {
    res.set('Service-Worker-Allowed', '/');
    file('sw.js')(_req, res, next);
  });
  app.use('/assets', express.static(join(root, 'assets'), { fallthrough: true, index: false }));

  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `Ruta no encontrada: ${req.method} ${req.path}` } }));
  app.use(errorHandler);
  return app;
}
