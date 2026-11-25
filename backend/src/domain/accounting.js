import { PaymentChannel } from './order.js';

/**
 * Reglas contables (funciones puras). Cada evento del negocio produce asientos
 * en el libro de movimientos. Los saldos NUNCA se guardan: se calculan sumando
 * asientos, así que siempre se puede auditar de dónde salió cada peso.
 *
 * Cuentas (iguales a las del prototipo):
 *  customer: payments (lo que pagó), wallet (monedero)
 *  operator: cash (efectivo en mano), earnings (ganancias por domicilio)
 *  center:   platform (saldo para pagar a proveedores), till (caja física), commissions
 */
export const Role = Object.freeze({ CUSTOMER: 'customer', OPERATOR: 'operator', CENTER: 'center' });

export const Account = Object.freeze({
  PAYMENTS: 'payments',
  WALLET: 'wallet',
  CASH: 'cash',
  EARNINGS: 'earnings',
  PLATFORM: 'platform',
  TILL: 'till',
  COMMISSIONS: 'commissions',
});

export const CENTER_OWNER = 'center';

/** @typedef {{ role: string, account: string, owner: string, concept: string, amount: number, orderId: number|null }} LedgerEntryDraft */

const entry = (role, account, owner, concept, amount, orderId = null) => ({ role, account, owner, concept, amount, orderId });

/** @param {import('./order.js').Order} order @returns {LedgerEntryDraft[]} */
export function cashCollectedEntries(order) {
  const { id, customerPhone: c, operatorId: op } = order;
  const out = [];
  if (order.amount > 0) {
    const concept = order.isWalletTopUp ? `Efectivo para recarga de monedero #${id}` : `Pago de ${order.displayName} #${id}`;
    out.push(entry(Role.CUSTOMER, Account.PAYMENTS, c, concept, -order.amount, id));
  }
  if (order.fee > 0) out.push(entry(Role.CUSTOMER, Account.PAYMENTS, c, `Comisión del servicio #${id}`, -order.fee, id));
  out.push(entry(Role.CUSTOMER, Account.PAYMENTS, c, `Domicilio #${id}`, -order.deliveryFee, id));
  out.push(entry(Role.OPERATOR, Account.CASH, op, `Efectivo recibido del cliente #${id}`, order.total, id));
  return out;
}

/** @param {import('./order.js').Order} order @param {'operator'|'center'} channel */
export function paymentApprovedEntries(order, channel) {
  const { id } = order;
  const out = [];
  if (order.isWalletTopUp) {
    out.push(entry(Role.CUSTOMER, Account.WALLET, order.customerPhone, `Recarga de monedero #${id}`, order.amount, id));
  } else {
    if (order.amount > 0) out.push(entry(Role.CENTER, Account.PLATFORM, CENTER_OWNER, `Pago de ${order.displayName} #${id}`, -order.amount, id));
    if (order.fee > 0) out.push(entry(Role.CENTER, Account.COMMISSIONS, CENTER_OWNER, `Comisión #${id} (${order.displayName})`, order.fee, id));
  }
  if (channel === PaymentChannel.CENTER) {
    out.push(entry(Role.OPERATOR, Account.CASH, order.operatorId, `Entrega de efectivo al Centro #${id}`, -order.settlementAmount, id));
    out.push(entry(Role.CENTER, Account.TILL, CENTER_OWNER, `Efectivo recibido del domiciliario #${id}`, order.settlementAmount, id));
  }
  return out;
}

/** Autopago: sale del monedero del cliente y la plataforma paga al proveedor. */
export function walletPaymentEntries(order) {
  const { id, customerPhone: c } = order;
  const out = [];
  if (order.amount > 0) {
    out.push(entry(Role.CUSTOMER, Account.WALLET, c, `Pago de ${order.displayName} #${id}`, -order.amount, id));
    out.push(entry(Role.CENTER, Account.PLATFORM, CENTER_OWNER, `Pago de ${order.displayName} #${id} (autopago)`, -order.amount, id));
  }
  if (order.fee > 0) {
    out.push(entry(Role.CUSTOMER, Account.WALLET, c, `Comisión del servicio #${id}`, -order.fee, id));
    out.push(entry(Role.CENTER, Account.COMMISSIONS, CENTER_OWNER, `Comisión #${id} (${order.displayName})`, order.fee, id));
  }
  return out;
}

/** @param {import('./order.js').Order} order */
export function deliveredEntries(order) {
  const { id, operatorId: op } = order;
  return [
    entry(Role.OPERATOR, Account.CASH, op, `Domicilio #${id} pasa a tus ganancias`, -order.deliveryFee, id),
    entry(Role.OPERATOR, Account.EARNINGS, op, `Ganancia por domicilio #${id}`, order.deliveryFee, id),
  ];
}

/** Reversa del cobro cuando el proveedor rechaza: el operador devuelve todo el efectivo. */
export function refundEntries(order) {
  const { id } = order;
  return [
    entry(Role.CUSTOMER, Account.PAYMENTS, order.customerPhone, `Devolución del pedido #${id}`, order.total, id),
    entry(Role.OPERATOR, Account.CASH, order.operatorId, `Efectivo devuelto al cliente #${id}`, -order.total, id),
  ];
}

/**
 * Recarga de monedero en efectivo, hecha por el operador o en el Centro.
 * @param {{ customerPhone: string, customerName: string, amount: number, channel: 'operator'|'center', operatorId?: string }} input
 */
export function walletTopUpEntries({ customerPhone, customerName, amount, channel, operatorId }) {
  const who = channel === 'operator' ? 'domiciliario' : 'Centro';
  return [
    channel === 'operator'
      ? entry(Role.OPERATOR, Account.CASH, operatorId, `Efectivo recibido para recarga de ${customerName}`, amount)
      : entry(Role.CENTER, Account.TILL, CENTER_OWNER, `Efectivo recibido para recarga de ${customerName}`, amount),
    entry(Role.CUSTOMER, Account.WALLET, customerPhone, `Recarga de saldo en efectivo (${who})`, amount),
  ];
}

/** El operador entrega en el Centro el efectivo que no es suyo. */
export function settlementEntries({ operatorId, amount, orderIds }) {
  const label = orderIds.length ? ` (#${orderIds.join(', #')})` : '';
  return [
    entry(Role.OPERATOR, Account.CASH, operatorId, `Rendición de caja al Centro${label}`, -amount),
    entry(Role.CENTER, Account.TILL, CENTER_OWNER, 'Efectivo recibido del domiciliario (rendición)', amount),
  ];
}

export function platformRechargeEntries(amount) {
  return [entry(Role.CENTER, Account.PLATFORM, CENTER_OWNER, 'Recarga de saldo de plataforma desde banco', amount)];
}
