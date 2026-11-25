import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { normalizeColombianMobile } from '../../domain/phone.js';
import { validate } from '../middleware.js';
import { ValidationError } from '../../shared/errors.js';

/**
 * Herramientas de desarrollo. Solo se montan fuera de producción.
 *
 *   POST /dev/simulate  { "from": "3128889900", "text": "hola" }   -> simula un mensaje de Telegram
 *   POST /dev/simulate  { "from": "3128889900", "replyId": "new" }
 *   POST /dev/reset                                                 -> "Reiniciar demo"
 *
 * @param {import('../../container.js').Container} c
 */
export function devRoutes(c) {
  const router = Router();

  router.post('/simulate',
    validate({ body: z.object({ from: z.string(), text: z.string().max(1000).optional(), replyId: z.string().max(200).optional() }).refine((b) => b.text || b.replyId, 'Envía text o replyId') }),
    async (req, res) => {
      const { from, text, replyId } = req.valid.body;
      const phone = normalizeColombianMobile(from);
      if (!phone) throw new ValidationError('Celular no válido');
      const incoming = { messageId: `dev-${randomUUID()}`, from: phone, type: replyId ? 'reply' : 'text', text: text ?? '', replyId };
      const replies = await c.chat.converse(incoming, 'telegram');
      c.messaging.drain?.(phone);
      res.json({ to: phone, replies });
    });

  router.post('/reset', (_req, res) => {
    c.resetDemo();
    res.json({ ok: true });
  });

  return router;
}
