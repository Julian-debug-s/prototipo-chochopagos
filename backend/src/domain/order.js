import { DomainError, ValidationError } from '../shared/errors.js';
import { getService, findService, MIN_AMOUNT, MAX_AMOUNT } from './catalog.js';
import { assertPesos } from './money.js';

/**
 * Ciclo de vida de un pedido a domicilio:
 *
 *  REQUESTED ──accept──▶ ON_THE_WAY ──collect──▶ CASH_COLLECTED ──pay──▶ PAID ──deliver──▶ DELIVERED
 *      │                     │                         │
 *      └──────cancel─────────┘                         ├──pay(pending)──▶ PENDING_PROVIDER ──resolve──▶ PAID | REJECTED
 *               ▼                                      └──pay(rejected)─▶ REJECTED ──refund──▶ REFUNDED
 *           CANCELLED
 *
 * La entidad solo valida y cambia su propio estado. Los asientos contables
 * los calcula `accounting.js`; la persistencia la hace el repositorio.
 */
export const OrderStatus = Object.freeze({
  REQUESTED: 'REQUESTED',
  ON_THE_WAY: 'ON_THE_WAY',
  CASH_COLLECTED: 'CASH_COLLECTED',
  PAID: 'PAID',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
  PENDING_PROVIDER: 'PENDING_PROVIDER',
  REFUNDED: 'REFUNDED',
});

export const ACTIVE_STATUSES = Object.freeze([
  OrderStatus.REQUESTED, OrderStatus.ON_THE_WAY, OrderStatus.CASH_COLLECTED,
  OrderStatus.PENDING_PROVIDER, OrderStatus.PAID, OrderStatus.REJECTED,
]);

export const PaymentResult = Object.freeze({ APPROVED: 'approved', PENDING: 'pending', REJECTED: 'rejected' });

/** Quién ejecutó el pago ante el proveedor. WALLET = el cliente pagó con su saldo desde casa. */
export const PaymentChannel = Object.freeze({ OPERATOR_APP: 'operator', CENTER: 'center', WALLET: 'wallet' });

/** Campos obligatorios del trámite que aún no tienen valor. */
function missingFields(service, fields) {
  return service.fields
    .filter((field) => field.type !== 'amount' && !field.optional && !String(fields[field.key] ?? '').trim())
    .map((field) => field.label);
}

function validateAmount(service, amount) {
  const finalAmount = service.fixedAmount ?? amount;
  if (service.fixedAmount === null && (!Number.isSafeInteger(finalAmount) || finalAmount < MIN_AMOUNT || finalAmount > MAX_AMOUNT)) {
    throw new ValidationError(`El valor debe estar entre $${MIN_AMOUNT} y $${MAX_AMOUNT}`);
  }
  return assertPesos(finalAmount, 'amount');
}

const referenceOf = (service, fields) => (service.referenceField ? String(fields[service.referenceField] ?? '') : 'Recarga de saldo');

export class Order {
  /** @param {OrderProps} props */
  constructor(props) {
    Object.assign(this, props);
  }

  /**
   * Fábrica: valida los datos del trámite y crea un pedido nuevo en estado REQUESTED.
   * @param {object} input
   * @param {string} input.customerPhone
   * @param {string} input.serviceCode
   * @param {string} [input.provider]
   * @param {Record<string,string>} [input.fields]
   * @param {number} [input.amount]
   * @param {number} input.deliveryFee
   * @param {string} input.deliveryCode
   * @param {string} [input.channel]
   * @param {string|null} [input.receiptPath]
   * @param {Date} input.now
   */
  static create({ customerPhone, serviceCode, provider = '', fields = {}, amount, deliveryFee, deliveryCode, channel = 'telegram', receiptPath = null, now }) {
    const service = findService(serviceCode);
    if (!service) throw new ValidationError(`Servicio desconocido: ${serviceCode}`);

    if (service.providers.length && !service.providers.includes(provider)) {
      throw new ValidationError(`Proveedor no válido para ${service.name}`, { allowed: service.providers });
    }

    const finalAmount = validateAmount(service, amount);

    // Con foto del recibo, el domiciliario completa los datos faltantes después
    // (paso "Guardar información completa"). Sin foto, el cliente debe darlos todos.
    const missing = missingFields(service, fields);
    if (missing.length && !receiptPath) throw new ValidationError(`Faltan datos: ${missing.join(', ')}`, { missing });

    return new Order({
      id: null,
      customerPhone,
      serviceCode,
      provider,
      reference: referenceOf(service, fields) || (receiptPath ? 'Recibo' : ''),
      fields: { ...fields },
      amount: finalAmount,
      fee: service.fee,
      deliveryFee: assertPesos(deliveryFee, 'deliveryFee'),
      status: OrderStatus.REQUESTED,
      deliveryCode,
      arrived: false,
      receiptVerified: false,
      operationVerified: false,
      paidVia: null,
      settled: false,
      failureReason: null,
      receiptPath,
      evidenceUrl: null,
      channel,
      operatorId: null,
      createdAt: now,
      updatedAt: now,
      deliveredAt: null,
      cancelledAt: null,
      version: 0,
    });
  }

  /**
   * Pago desde casa con el saldo del monedero ("O hazlo tú desde casa"):
   * sin domicilio, y el pedido nace ya pagado y entregado.
   */
  static createSelfPaid({ customerPhone, serviceCode, provider = '', fields = {}, amount, channel = 'telegram', now }) {
    const service = findService(serviceCode);
    if (!service) throw new ValidationError(`Servicio desconocido: ${serviceCode}`);
    if (!service.selfPayable) throw new DomainError('NOT_SELF_PAYABLE', `${service.name} no se puede pagar con el saldo; pide el domicilio`);
    const order = Order.create({ customerPhone, serviceCode, provider, fields, amount, deliveryFee: 0, deliveryCode: '', channel, now });
    Object.assign(order, {
      status: OrderStatus.DELIVERED, paidVia: PaymentChannel.WALLET, settled: true,
      arrived: true, receiptVerified: true, operationVerified: true, deliveredAt: now,
    });
    return order;
  }

  get service() {
    return getService(this.serviceCode);
  }

  get missingFields() {
    return missingFields(this.service, this.fields);
  }

  get displayName() {
    return this.provider ? `${this.service.name} - ${this.provider}` : this.service.name;
  }

  /** Lo que el cliente entrega en efectivo. */
  get total() {
    return this.amount + this.fee + this.deliveryFee;
  }

  /** Lo que el operador debe entregar al Centro (el domicilio es su ganancia). */
  get settlementAmount() {
    return this.amount + this.fee;
  }

  get isWalletTopUp() {
    return this.serviceCode === 'wallet_topup';
  }

  get isCancellable() {
    return this.status === OrderStatus.REQUESTED || this.status === OrderStatus.ON_THE_WAY;
  }

  // ---------- Transiciones ----------

  accept(operatorId, now) {
    this.#transition([OrderStatus.REQUESTED], OrderStatus.ON_THE_WAY, now);
    this.operatorId = operatorId;
  }

  markArrived(now) {
    this.#requireStatus([OrderStatus.ON_THE_WAY]);
    if (this.arrived) throw new DomainError('ALREADY_ARRIVED', 'Ya se registró la llegada');
    this.arrived = true;
    this.updatedAt = now;
  }

  /**
   * El operador recibe el efectivo en la casa del cliente.
   * @param {{ cashReceived: number, customerCode: string, receiptVerified: boolean }} input
   */
  collectCash({ cashReceived, customerCode, receiptVerified }, now) {
    this.#requireStatus([OrderStatus.ON_THE_WAY]);
    if (!this.arrived) throw new DomainError('NOT_ARRIVED', 'Primero registra la llegada a la casa del cliente');
    if (!receiptVerified) throw new DomainError('RECEIPT_NOT_VERIFIED', 'Verifica el recibo antes de recibir el efectivo');
    if (cashReceived !== this.total) {
      const diff = Math.abs(this.total - cashReceived);
      throw new DomainError('CASH_MISMATCH', cashReceived < this.total ? `Faltan $${diff} para completar` : `Sobran $${diff}. Devuelve el cambio`, { expected: this.total, received: cashReceived });
    }
    if (String(customerCode) !== this.deliveryCode) throw new DomainError('INVALID_DELIVERY_CODE', 'El código del cliente no coincide');
    this.receiptVerified = true;
    this.#transition([OrderStatus.ON_THE_WAY], OrderStatus.CASH_COLLECTED, now);
  }

  /**
   * El domiciliario revisa el recibo y completa los datos de la operación antes
   * de pagar. El valor NO se puede cambiar: ya se cobró en efectivo.
   * @param {Record<string,string>} fields
   */
  completeOperationData(fields, now) {
    this.#requireStatus([OrderStatus.CASH_COLLECTED]);
    const merged = { ...this.fields };
    for (const field of this.service.fields) {
      if (field.type === 'amount') continue;
      const value = fields[field.key];
      if (value !== undefined) merged[field.key] = String(value).trim().slice(0, 120);
    }
    const missing = missingFields(this.service, merged);
    if (missing.length) throw new ValidationError(`Falta: ${missing[0]}`, { missing });
    this.fields = merged;
    this.reference = referenceOf(this.service, merged) || this.reference;
    this.operationVerified = true;
    this.updatedAt = now;
  }

  assertPayable() {
    this.#requireStatus([OrderStatus.CASH_COLLECTED, OrderStatus.PENDING_PROVIDER]);
  }

  /**
   * Aplica la respuesta del proveedor de pagos.
   * @param {'approved'|'pending'|'rejected'} result
   * @param {'operator'|'center'} channel
   */
  applyPaymentResult(result, channel, now) {
    this.assertPayable();
    if (channel !== PaymentChannel.OPERATOR_APP && channel !== PaymentChannel.CENTER) throw new ValidationError(`Canal de pago no válido: ${channel}`);
    if (channel === PaymentChannel.OPERATOR_APP && !this.operationVerified) {
      throw new DomainError('OPERATION_NOT_VERIFIED', 'Completa y verifica la información de la operación antes de pagar');
    }

    if (result === PaymentResult.APPROVED) {
      this.#transition([OrderStatus.CASH_COLLECTED, OrderStatus.PENDING_PROVIDER], OrderStatus.PAID, now);
      this.paidVia = channel;
      this.failureReason = null;
      // Si el pago se hizo en el Centro, el operador ya entregó allí el efectivo.
      if (channel === PaymentChannel.CENTER) this.settled = true;
    } else if (result === PaymentResult.PENDING) {
      if (this.status === OrderStatus.PENDING_PROVIDER) throw new DomainError('ALREADY_PENDING', 'El pago ya está pendiente de confirmación');
      this.#transition([OrderStatus.CASH_COLLECTED], OrderStatus.PENDING_PROVIDER, now);
      this.paidVia = channel;
      this.failureReason = 'El proveedor dejó la operación pendiente de confirmación.';
    } else if (result === PaymentResult.REJECTED) {
      this.#transition([OrderStatus.CASH_COLLECTED, OrderStatus.PENDING_PROVIDER], OrderStatus.REJECTED, now);
      this.failureReason = 'El proveedor rechazó la operación.';
    } else {
      throw new ValidationError(`Resultado de pago no válido: ${result}`);
    }
  }

  deliver(now, evidenceUrl = null) {
    this.#transition([OrderStatus.PAID], OrderStatus.DELIVERED, now);
    this.deliveredAt = now;
    this.evidenceUrl = evidenceUrl;
  }

  /** @param {'customer'|'operator'|'center'} by */
  cancel(by, now) {
    if (!this.isCancellable) throw new DomainError('NOT_CANCELLABLE', 'Este pedido ya no se puede cancelar: el efectivo ya fue recibido');
    this.#transition([OrderStatus.REQUESTED, OrderStatus.ON_THE_WAY], OrderStatus.CANCELLED, now);
    this.cancelledAt = now;
    this.failureReason = `Cancelado por ${by}`;
  }

  /** Devuelve el efectivo al cliente tras un rechazo del proveedor. */
  refund(now) {
    this.#transition([OrderStatus.REJECTED], OrderStatus.REFUNDED, now);
  }

  markSettled() {
    if (this.settled) throw new DomainError('ALREADY_SETTLED', `El pedido #${this.id} ya fue rendido`);
    this.settled = true;
  }

  #requireStatus(allowed) {
    if (!allowed.includes(this.status)) {
      throw new DomainError('INVALID_TRANSITION', `El pedido #${this.id ?? 'nuevo'} está en estado ${this.status}; la operación no aplica`, { status: this.status, allowed });
    }
  }

  #transition(from, to, now) {
    this.#requireStatus(from);
    this.status = to;
    this.updatedAt = now;
  }
}

/**
 * @typedef {object} OrderProps
 * @property {number|null} id
 * @property {string} customerPhone
 * @property {string} serviceCode
 * @property {string} provider
 * @property {string} reference
 * @property {Record<string,string>} fields
 * @property {number} amount
 * @property {number} fee
 * @property {number} deliveryFee
 * @property {string} status
 * @property {string} deliveryCode
 * @property {boolean} arrived
 * @property {boolean} receiptVerified
 * @property {boolean} operationVerified
 * @property {'operator'|'center'|'wallet'|null} paidVia
 * @property {boolean} settled
 * @property {string|null} failureReason
 * @property {string|null} receiptPath
 * @property {string|null} evidenceUrl
 * @property {string} channel
 * @property {string|null} operatorId
 * @property {Date} createdAt
 * @property {Date} updatedAt
 * @property {Date|null} deliveredAt
 * @property {Date|null} cancelledAt
 * @property {number} version
 */
