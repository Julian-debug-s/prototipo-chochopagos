import { Router } from 'express';
import { z } from 'zod';
import { ACTIVE_STATUSES } from '../../domain/order.js';
import { normalizeColombianMobile } from '../../domain/phone.js';
import { orderDto } from '../../application/presenters.js';
import { userDto } from '../../application/userService.js';
import { requireRole, validate, idParam } from '../middleware.js';
import { AuthError } from '../../shared/errors.js';

const STAFF = ['operator', 'center'];
const phone = z.string().refine((v) => normalizeColombianMobile(v) !== null, 'No hay un usuario con ese celular').transform(normalizeColombianMobile);
const simulate = z.enum(['approved', 'pending', 'rejected']).optional();
const fileName = z.string().regex(/^[0-9a-f-]{36}\.(jpg|png|webp)$/);

/**
 * Rutas del Domiciliario (operator) y del Centro Comunitario (center).
 * @param {import('../../container.js').Container} c
 */
export function staffRoutes(c) {
  const router = Router();
  const { orderService: orders, financeService: finance, userService: users } = c;

  /** Pedido con los datos del cliente que necesita el domiciliario (sector, indicaciones). */
  const withCustomer = (order) => {
    const u = users.find(order.customerPhone);
    return orderDto(order, { customer: u ? { name: u.name, sector: u.sector, address: u.address } : null });
  };

  // ---------------- pedidos
  router.get('/orders',
    requireRole(...STAFF),
    validate({ query: z.object({ scope: z.enum(['active', 'all']).optional(), limit: z.coerce.number().int().min(1).max(500).optional() }) }),
    (req, res) => {
      const { scope, limit } = req.valid.query;
      res.json(orders.search({ statuses: scope === 'active' ? [...ACTIVE_STATUSES] : undefined, limit: limit ?? 200 }).map(withCustomer));
    });

  router.get('/orders/:id', requireRole(...STAFF), validate({ params: idParam }), (req, res) => {
    res.json(withCustomer(orders.get(req.valid.params.id)));
  });

  const action = (path, roles, schema, run) =>
    router.post(`/orders/:id/${path}`, requireRole(...roles), validate({ params: idParam, body: schema }), async (req, res) => {
      res.json(withCustomer(await run(req.valid.params.id, req.valid.body, req.actor)));
    });

  const empty = z.object({}).strict();
  action('accept', ['operator'], empty, (id, _b, actor) => orders.accept(id, actor.id));
  action('arrive', ['operator'], empty, (id) => orders.markArrived(id));
  action('collect', ['operator'],
    z.object({ cashReceived: z.number().int().nonnegative(), customerCode: z.string().regex(/^\d{4}$/, 'El código tiene 4 dígitos'), receiptVerified: z.literal(true) }),
    (id, body) => orders.collectCash(id, body));
  action('operation', ['operator'], z.object({ fields: z.record(z.string(), z.string().max(120)) }), (id, body) => orders.completeOperation(id, body.fields));
  action('pay', STAFF, z.object({ simulate }),
    (id, body, actor) => orders.pay(id, { channel: actor.role === 'center' ? 'center' : 'operator', simulate: body.simulate }));
  action('resolve', ['center'], z.object({ result: z.enum(['approved', 'rejected']) }), (id, body) => orders.resolvePending(id, body));
  action('deliver', ['operator'], z.object({ evidencePhoto: fileName.optional() }), (id, body) => orders.deliver(id, body));
  action('cancel', STAFF, empty, (id, _b, actor) => orders.cancel(id, { by: actor.role }));
  action('refund', ['operator'], empty, (id) => orders.refund(id));

  // ---------------- usuarios y paneles
  router.get('/users', requireRole('center'), (_req, res) => {
    res.json(users.list().map((u) => ({ ...userDto(u), orderCount: u.orderCount })));
  });

  router.get('/operator/summary', requireRole('operator'), (req, res) => res.json(finance.operatorSummary(req.actor.id)));
  router.get('/center/dashboard', requireRole('center'), (_req, res) => res.json(finance.centerDashboard()));

  // ---------------- dinero
  router.post('/wallet/topups', requireRole(...STAFF),
    validate({ body: z.object({ phone, amount: z.number().int(), identityVerified: z.literal(true, { message: 'Confirma que verificaste su identidad con la cédula' }) }) }),
    async (req, res) => {
      const { phone: customerPhone, amount, identityVerified } = req.valid.body;
      res.status(201).json(await finance.topUpWallet({ customerPhone, amount, identityVerified, channel: req.actor.role, actorId: req.actor.id }));
    });

  router.post('/settlements', requireRole('operator'), async (req, res) => {
    res.status(201).json(await finance.settleOperatorCash(req.actor.id));
  });

  router.post('/platform/recharge', requireRole('center'),
    validate({ body: z.object({ amount: z.number().int().positive().max(50_000_000) }) }),
    (req, res) => res.status(201).json(finance.rechargePlatform(req.valid.body.amount)));

  router.get('/ledger', requireRole(...STAFF),
    validate({ query: z.object({ role: z.enum(['customer', 'operator', 'center']).optional(), limit: z.coerce.number().int().min(1).max(500).optional() }) }),
    (req, res) => {
      // Cada quien ve sus propios movimientos (led('d') y led('c') del prototipo).
      if (req.valid.query.role && req.valid.query.role !== req.actor.role) throw new AuthError('FORBIDDEN', 'Solo puedes ver tus movimientos');
      const owner = req.actor.role === 'operator' ? req.actor.id : 'center';
      res.json(finance.ledger({ role: req.actor.role, owner, limit: req.valid.query.limit ?? 40 }));
    });

  return router;
}

