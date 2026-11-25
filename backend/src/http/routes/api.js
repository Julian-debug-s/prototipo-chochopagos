import { Router, raw } from 'express';
import { z } from 'zod';
import { CATEGORIES, listServices, DATA_PACKAGES } from '../../domain/catalog.js';
import { authenticate, requireRole, validate } from '../middleware.js';
import { NotFoundError, ValidationError, AuthError } from '../../shared/errors.js';
import { authRoutes } from './auth.js';
import { customerRoutes } from './customer.js';
import { staffRoutes } from './staff.js';

/**
 * Composición de la API REST. Los controladores son delgados: validan,
 * llaman al caso de uso y serializan.
 * @param {import('../../container.js').Container} c
 */
export function apiRoutes(c) {
  const router = Router();

  // ---------------- público
  router.get('/catalog', (_req, res) => {
    res.json({
      categories: CATEGORIES,
      services: listServices(),
      dataPackages: DATA_PACKAGES,
      deliveryFee: c.config.deliveryFee,
      sectors: c.config.sectors,
      operatorName: c.config.operatorName,
      telegram: c.config.telegram.enabled,
      telegramBot: c.telegram?.username ?? null,
      demo: !c.config.isProduction,
    });
  });
  router.use('/auth', authRoutes(c));

  // ---------------- con sesión
  router.use(authenticate(c.authService));
  router.use('/me', requireRole('customer'), customerRoutes(c));
  router.use(staffRoutes(c));

  // Subida de fotos (recibo desde la app, evidencia de entrega). Devuelve el nombre guardado.
  router.post('/uploads', raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }), async (req, res) => {
    const type = req.get('content-type')?.split(';')[0];
    if (!Buffer.isBuffer(req.body) || !req.body.length || !c.mediaStore.isAllowedType(type)) throw new ValidationError('Envía una imagen JPG, PNG o WEBP');
    res.status(201).json({ name: await c.mediaStore.save(req.body, type) });
  });

  // Fotos: el personal ve todas; el cliente solo las de sus pedidos o su chat.
  router.get('/media/:name', validate({ params: z.object({ name: z.string().max(60) }) }), (req, res, next) => {
    const { name } = req.valid.params;
    const path = c.mediaStore.resolve(name);
    if (!path) throw new NotFoundError('Archivo', name);
    if (req.actor.role === 'customer' && !customerOwnsMedia(c, req.actor.id, name)) throw new AuthError('FORBIDDEN', 'No puedes ver ese archivo');
    res.set('Cache-Control', 'private, max-age=3600');
    res.sendFile(path, (err) => err && next(err.code === 'ENOENT' ? new NotFoundError('Archivo', name) : err));
  });

  return router;
}

function customerOwnsMedia(c, phone, name) {
  const inOrders = c.orderService.listForCustomer(phone, 500).some((o) => o.receiptPath === name || o.evidenceUrl === name);
  return inOrders || c.chat.history(phone, { limit: 500 }).some((m) => m.message?.media === name);
}
