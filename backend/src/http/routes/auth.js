import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware.js';
import { userDto } from '../../application/userService.js';

const pin = z.string().regex(/^\d{4}$/, 'El PIN debe tener 4 números');

/**
 * Acceso, igual que las pantallas del prototipo:
 *  - Cliente: celular + PIN, o registro "Crea tu cuenta".
 *  - Personal: código (OP-01 / CC-01) + PIN.
 * @param {import('../../container.js').Container} c
 */
export function authRoutes(c) {
  const router = Router();

  router.post('/customer', validate({ body: z.object({ phone: z.string().max(20), pin }) }), (req, res) => {
    const { token, actor } = c.authService.loginCustomer(req.valid.body.phone, req.valid.body.pin);
    res.json({ token, actor, user: userDto(c.userService.get(actor.id)) });
  });

  router.post('/register',
    validate({
      body: z.object({
        name: z.string().max(80), document: z.string().max(12), phone: z.string().max(20),
        sector: z.string().max(60), address: z.string().max(160), pin, pinConfirm: pin, consent: z.boolean(),
      }).refine((b) => b.pin === b.pinConfirm, { message: 'Los PIN no coinciden', path: ['pinConfirm'] }),
    }),
    (req, res) => {
      const { pinConfirm, ...data } = req.valid.body;
      const user = c.userService.register(data);
      const { token, actor } = c.authService.issueCustomer(user);
      res.status(201).json({ token, actor, user: userDto(user) });
    });

  router.post('/staff', validate({ body: z.object({ code: z.string().max(20), pin }) }), (req, res) => {
    const session = c.authService.loginStaff(req.valid.body.code, req.valid.body.pin);
    res.json({ ...session, operatorName: c.config.operatorName });
  });

  return router;
}
