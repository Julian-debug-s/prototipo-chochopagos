import { Order, OrderStatus, PaymentChannel } from '../domain/order.js';
import {
  Role, Account, CENTER_OWNER,
  cashCollectedEntries, paymentApprovedEntries, deliveredEntries, refundEntries, walletPaymentEntries,
} from '../domain/accounting.js';
import { DomainError, NotFoundError, AuthError } from '../shared/errors.js';

export const OrderEvents = Object.freeze({
  CREATED: 'order.created',
  STATUS_CHANGED: 'order.statusChanged',
  ARRIVED: 'order.arrived',
});

/**
 * Casos de uso del ciclo de vida de un pedido.
 *
 * Patrón de cada operación: leer → validar en el dominio → persistir pedido y
 * asientos en UNA transacción → publicar eventos después del commit (así nunca
 * se notifica algo que luego se revierte).
 *
 * @param {object} deps
 * @param {import('../infrastructure/db/database.js').Database} deps.database
 * @param {ReturnType<typeof import('../infrastructure/repositories/orderRepository.js').createOrderRepository>} deps.orders
 * @param {ReturnType<typeof import('../infrastructure/repositories/userRepository.js').createUserRepository>} deps.users
 * @param {ReturnType<typeof import('../infrastructure/repositories/ledgerRepository.js').createLedgerRepository>} deps.ledger
 * @param {import('../shared/eventBus.js').EventBus} deps.events
 * @param {{ pay(request: object): Promise<{ status: 'approved'|'pending'|'rejected', providerReference?: string }> }} deps.paymentProvider
 * @param {() => Date} deps.clock
 * @param {() => string} deps.generateDeliveryCode
 * @param {number} deps.deliveryFee
 * @param {(phone: string, pin: string) => boolean} deps.checkPin
 */
export function createOrderService({ database, orders, users, ledger, events, paymentProvider, clock, generateDeliveryCode, deliveryFee, checkPin }) {
  function load(id) {
    const order = orders.findById(id);
    if (!order) throw new NotFoundError('Pedido', id);
    return order;
  }

  function ensurePlatformFunds(order) {
    if (order.isWalletTopUp || order.amount === 0) return;
    const available = ledger.balance(Role.CENTER, Account.PLATFORM, CENTER_OWNER);
    if (available < order.amount) {
      throw new DomainError('INSUFFICIENT_PLATFORM_FUNDS', 'Saldo de plataforma insuficiente. Recarga en el Centro Comunitario.', { available, required: order.amount });
    }
  }

  /**
   * Plantilla común de las transiciones.
   * @param {number} id
   * @param {(order: Order, now: Date) => import('../domain/accounting.js').LedgerEntryDraft[] | void} apply
   * @param {{ actor: string, extraEvent?: string }} meta
   */
  async function mutate(id, apply, { actor, extraEvent }) {
    const { order, previousStatus } = database.transaction(() => {
      const order = load(id);
      const previousStatus = order.status;
      const now = clock();
      const entries = apply(order, now) ?? [];
      orders.update(order);
      ledger.append(entries, now);
      return { order, previousStatus };
    });

    if (order.status !== previousStatus) await events.publish(OrderEvents.STATUS_CHANGED, { order, previousStatus, actor });
    if (extraEvent) await events.publish(extraEvent, { order, actor });
    return order;
  }

  return {
    /** Tarifa de domicilio vigente (para mostrar totales antes de crear el pedido). */
    deliveryFee,

    get: load,

    listForCustomer: (phone, limit) => orders.findByCustomer(phone, limit),

    search: (filter) => orders.search(filter),

    /**
     * @param {{ customerPhone: string, serviceCode: string, provider?: string, fields?: Record<string,string>, amount?: number, channel?: string, receiptPath?: string|null }} input
     */
    async create(input) {
      if (!users.findByPhone(input.customerPhone)) throw new DomainError('USER_NOT_REGISTERED', 'El cliente no está registrado');
      const order = Order.create({ ...input, deliveryFee, deliveryCode: generateDeliveryCode(), now: clock() });
      database.transaction(() => orders.insert(order));
      await events.publish(OrderEvents.CREATED, { order, actor: 'customer' });
      return order;
    },

    /**
     * "O hazlo tú desde casa": paga con el saldo del monedero, sin domicilio.
     * @param {{ customerPhone: string, pin: string, serviceCode: string, provider?: string, fields?: Record<string,string>, amount?: number, channel?: string }} input
     */
    async payWithWallet({ pin, ...input }) {
      if (!users.findByPhone(input.customerPhone)) throw new DomainError('USER_NOT_REGISTERED', 'El cliente no está registrado');
      if (!checkPin(input.customerPhone, pin)) throw new AuthError('INVALID_PIN', 'PIN incorrecto');

      const order = database.transaction(() => {
        const draft = Order.createSelfPaid({ ...input, now: clock() });
        const needed = draft.amount + draft.fee;
        const wallet = ledger.balance(Role.CUSTOMER, Account.WALLET, input.customerPhone);
        if (wallet < needed) throw new DomainError('INSUFFICIENT_WALLET', `Tu saldo no alcanza: te faltan $${needed - wallet}`, { wallet, needed });
        ensurePlatformFunds(draft);
        orders.insert(draft);
        ledger.append(walletPaymentEntries(draft), draft.createdAt);
        return draft;
      });
      await events.publish(OrderEvents.CREATED, { order, actor: 'customer' });
      return order;
    },

    accept: (id, operatorId) =>
      mutate(id, (o, now) => o.accept(operatorId, now), { actor: 'operator' }),

    /** El domiciliario verifica el recibo y completa los datos ("Guardar información completa"). */
    completeOperation: (id, fields) =>
      mutate(id, (o, now) => o.completeOperationData(fields, now), { actor: 'operator' }),

    markArrived: (id) =>
      mutate(id, (o, now) => o.markArrived(now), { actor: 'operator', extraEvent: OrderEvents.ARRIVED }),

    /** @param {{ cashReceived: number, customerCode: string, receiptVerified: boolean }} input */
    collectCash: (id, input) =>
      mutate(id, (o, now) => {
        o.collectCash(input, now);
        return cashCollectedEntries(o);
      }, { actor: 'operator' }),

    /**
     * Paga el trámite ante el proveedor (simulado).
     * La llamada externa ocurre FUERA de la transacción; el resultado se aplica
     * después dentro de una, y el bloqueo optimista detecta carreras.
     * @param {number} id
     * @param {{ channel: 'operator'|'center', simulate?: 'approved'|'pending'|'rejected' }} input
     */
    async pay(id, { channel, simulate }) {
      const order = load(id);
      if (order.status === OrderStatus.PENDING_PROVIDER) throw new DomainError('ALREADY_PENDING', 'El pago está pendiente; usa "resolver" cuando el proveedor confirme');
      if (order.status !== OrderStatus.CASH_COLLECTED) throw new DomainError('INVALID_TRANSITION', `Primero se debe recibir el efectivo del pedido #${id}`, { status: order.status });
      ensurePlatformFunds(order);

      const result = await paymentProvider.pay({
        orderId: order.id, serviceCode: order.serviceCode, provider: order.provider, reference: order.reference, amount: order.amount, simulate,
      });

      return mutate(id, (o, now) => {
        if (result.status === 'approved') ensurePlatformFunds(o);
        o.applyPaymentResult(result.status, channel, now);
        return o.status === OrderStatus.PAID ? paymentApprovedEntries(o, channel) : [];
      }, { actor: channel });
    },

    /** Confirma un pago que quedó pendiente en el proveedor. */
    resolvePending: (id, { result }) =>
      mutate(id, (o, now) => {
        if (o.status !== OrderStatus.PENDING_PROVIDER) throw new DomainError('NOT_PENDING', `El pedido #${id} no está pendiente`);
        if (result === 'approved') ensurePlatformFunds(o);
        const channel = o.paidVia ?? PaymentChannel.OPERATOR_APP;
        o.applyPaymentResult(result, channel, now);
        return o.status === OrderStatus.PAID ? paymentApprovedEntries(o, channel) : [];
      }, { actor: 'center' }),

    /** @param {{ evidencePhoto?: string|null }} [input] nombre del archivo de evidencia ya subido */
    deliver: (id, { evidencePhoto = null } = {}) =>
      mutate(id, (o, now) => {
        o.deliver(now, evidencePhoto);
        return deliveredEntries(o);
      }, { actor: 'operator' }),

    /**
     * @param {number} id
     * @param {{ by: 'customer'|'operator'|'center', customerPhone?: string }} input
     */
    cancel: (id, { by, customerPhone }) =>
      mutate(id, (o, now) => {
        if (by === 'customer' && o.customerPhone !== customerPhone) throw new AuthError('FORBIDDEN', 'Ese pedido no es tuyo');
        o.cancel(by, now);
      }, { actor: by }),

    refund: (id) =>
      mutate(id, (o, now) => {
        o.refund(now);
        return refundEntries(o);
      }, { actor: 'operator' }),
  };
}

/** @typedef {ReturnType<typeof createOrderService>} OrderService */
