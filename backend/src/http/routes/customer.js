import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { validate, idParam } from '../middleware.js';
import { orderDto } from '../../application/presenters.js';
import { userDto } from '../../application/userService.js';

/**
 * Rutas del cliente autenticado (pestaña Usuario del prototipo).
 * El chat web usa el MISMO asistente que Telegram y comparte su historial.
 * @param {import('../../container.js').Container} c
 */
export function customerRoutes(c) {
  const router = Router();
  const me = (req) => req.actor.id;

  router.get('/', (req, res) => {
    const user = c.userService.get(me(req));
    res.json({ user: userDto(user), balances: c.financeService.customerBalances(user.phone), orderCount: c.orderService.listForCustomer(user.phone, 1000).length });
  });

  router.get('/orders', (req, res) => {
    res.json(c.orderService.listForCustomer(me(req), 100).map((o) => orderDto(o, { includeCode: true })));
  });

  router.post('/orders/:id/cancel', validate({ params: idParam }), async (req, res) => {
    const order = await c.orderService.cancel(req.valid.params.id, { by: 'customer', customerPhone: me(req) });
    res.json(orderDto(order, { includeCode: true }));
  });

  router.get('/ledger', (req, res) => {
    res.json(c.financeService.ledger({ role: 'customer', owner: me(req), limit: 60 }));
  });

  // ---------------- chat (mismo asistente que Telegram)
  router.get('/chat', validate({ query: z.object({ after: z.coerce.number().int().nonnegative().optional() }) }), (req, res) => {
    res.json({ messages: c.chat.history(me(req), { afterId: req.valid.query.after ?? 0, limit: 80 }), step: c.chat.step(me(req)) });
  });

  router.post('/chat',
    validate({
      body: z.object({ text: z.string().max(1000).optional(), replyId: z.string().max(200).optional(), photo: z.string().max(60).optional() })
        .refine((b) => b.text || b.replyId || b.photo, 'Envía text, replyId o photo'),
    }),
    async (req, res) => {
      const { text, replyId, photo } = req.valid.body;
      const incoming = photo
        ? { type: 'image', media: { stored: photo }, text: '' }
        : replyId ? { type: 'reply', replyId, text: text ?? '' } : { type: 'text', text };
      const replies = await c.chat.converse({ messageId: `web-${randomUUID()}`, from: me(req), ...incoming }, 'web');
      res.json({ replies, step: c.chat.step(me(req)) });
    });

  return router;
}
