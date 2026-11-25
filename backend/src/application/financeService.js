import { OrderStatus, PaymentChannel } from '../domain/order.js';
import {
  Role, Account, CENTER_OWNER,
  walletTopUpEntries, settlementEntries, platformRechargeEntries,
} from '../domain/accounting.js';
import { DomainError, NotFoundError, ValidationError } from '../shared/errors.js';

export const FinanceEvents = Object.freeze({
  WALLET_TOPPED_UP: 'wallet.toppedUp',
  CASH_SETTLED: 'cash.settled',
});

export const TOPUP_LIMITS = Object.freeze({ min: 1000, max: 500_000 });

/**
 * Movimientos de dinero que no son un pedido: recargas de monedero, rendición
 * de caja del domiciliario y recarga del saldo de plataforma. También consultas de saldos.
 */
export function createFinanceService({ database, orders, users, ledger, topUps, events, clock, initialPaperSheets = 120 }) {
  const unsettledFor = (operatorId) => ({
    orders: orders.search({ statuses: [OrderStatus.PAID, OrderStatus.DELIVERED], settled: false, paidVia: PaymentChannel.OPERATOR_APP, operatorId }),
    topUps: topUps.findUnsettledByOperator(operatorId),
  });

  return {
    /** Lo que muestra "Caja y movimientos" del domiciliario. */
    operatorSummary(operatorId) {
      const pending = unsettledFor(operatorId);
      const b = ledger.balancesFor(Role.OPERATOR, operatorId);
      return {
        cash: b[Account.CASH] ?? 0,
        earnings: b[Account.EARNINGS] ?? 0,
        pendingSettlement: pending.orders.reduce((s, o) => s + o.settlementAmount, 0) + pending.topUps.reduce((s, t) => s + t.amount, 0),
        unsettledOrders: pending.orders.map((o) => o.id),
        platform: ledger.balance(Role.CENTER, Account.PLATFORM, CENTER_OWNER),
      };
    },

    /** Indicadores del panel del Centro (KPIs del prototipo). */
    centerDashboard() {
      const all = orders.search({ limit: 100_000 });
      const processed = all.filter((o) => [OrderStatus.PAID, OrderStatus.DELIVERED].includes(o.status));
      const delivered = all.filter((o) => o.status === OrderStatus.DELIVERED && o.deliveredAt && o.paidVia !== PaymentChannel.WALLET);
      const avgMinutes = delivered.length
        ? delivered.reduce((s, o) => s + (o.deliveredAt.getTime() - o.createdAt.getTime()), 0) / delivered.length / 60_000
        : null;
      const printed = all.filter((o) => o.paidVia === PaymentChannel.CENTER && [OrderStatus.PAID, OrderStatus.DELIVERED].includes(o.status)).length;
      const b = ledger.balancesFor(Role.CENTER, CENTER_OWNER);
      return {
        transactions: processed.length,
        processedAmount: processed.reduce((s, o) => s + o.amount, 0),
        commissions: b[Account.COMMISSIONS] ?? 0,
        averageMinutes: avgMinutes === null ? null : Math.round(avgMinutes),
        users: users.list().length,
        platform: b[Account.PLATFORM] ?? 0,
        till: b[Account.TILL] ?? 0,
        // Cada pago impreso en el Centro gasta una hoja.
        paperSheets: Math.max(0, initialPaperSheets - printed),
      };
    },

    /**
     * @param {{ customerPhone: string, amount: number, channel: 'operator'|'center', actorId: string, identityVerified: boolean }} input
     */
    async topUpWallet({ customerPhone, amount, channel, actorId, identityVerified }) {
      const user = users.findByPhone(customerPhone);
      if (!user) throw new NotFoundError('Usuario', customerPhone);
      if (!Number.isSafeInteger(amount) || amount < TOPUP_LIMITS.min || amount > TOPUP_LIMITS.max) {
        throw new ValidationError(`El valor debe estar entre $${TOPUP_LIMITS.min} y $${TOPUP_LIMITS.max}`);
      }
      if (!identityVerified) throw new DomainError('IDENTITY_NOT_VERIFIED', 'Confirma que verificaste su identidad con la cédula');

      const now = clock();
      database.transaction(() => {
        topUps.insert({ customerPhone, amount, channel, operatorId: channel === 'operator' ? actorId : null, now });
        ledger.append(walletTopUpEntries({ customerPhone, customerName: user.name, amount, channel, operatorId: actorId }), now);
      });
      const balance = ledger.balance(Role.CUSTOMER, Account.WALLET, customerPhone);
      await events.publish(FinanceEvents.WALLET_TOPPED_UP, { customerPhone, amount, balance });
      return { amount, balance };
    },

    /** El domiciliario entrega al Centro el efectivo de pagos hechos en su app y de recargas. */
    async settleOperatorCash(operatorId) {
      const now = clock();
      const result = database.transaction(() => {
        const { orders: pendingOrders, topUps: pendingTopUps } = unsettledFor(operatorId);
        const amount = pendingOrders.reduce((sum, o) => sum + o.settlementAmount, 0) + pendingTopUps.reduce((sum, t) => sum + t.amount, 0);
        if (amount === 0) throw new DomainError('NOTHING_TO_SETTLE', 'Nada por rendir');

        for (const order of pendingOrders) {
          order.markSettled();
          orders.update(order);
        }
        topUps.markSettled(pendingTopUps.map((t) => t.id));
        const orderIds = pendingOrders.map((o) => o.id);
        ledger.append(settlementEntries({ operatorId, amount, orderIds }), now);
        return { amount, orderIds, topUpCount: pendingTopUps.length };
      });
      await events.publish(FinanceEvents.CASH_SETTLED, { operatorId, ...result });
      return result;
    },

    rechargePlatform(amount) {
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new ValidationError('Valor no válido');
      database.transaction(() => ledger.append(platformRechargeEntries(amount), clock()));
      return { platform: ledger.balance(Role.CENTER, Account.PLATFORM, CENTER_OWNER) };
    },

    customerBalances(phone) {
      const b = ledger.balancesFor(Role.CUSTOMER, phone);
      return { wallet: b[Account.WALLET] ?? 0, payments: b[Account.PAYMENTS] ?? 0 };
    },

    ledger: (filter) => ledger.list(filter),
  };
}

/** @typedef {ReturnType<typeof createFinanceService>} FinanceService */
