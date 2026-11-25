/**
 * Textos para personas (Telegram, chat web y API). Son los mismos del prototipo
 * (LB y MSG en app.js). Mantenerlos aquí evita que el dominio dependa de la redacción.
 */
import { OrderStatus } from '../domain/order.js';
import { formatCOP } from '../domain/money.js';

/** Posición del estado en el prototipo: define el color (.p0 … .p7) y la barra de seguimiento. */
export const STATUS_INDEX = Object.freeze({
  [OrderStatus.REQUESTED]: 0,
  [OrderStatus.ON_THE_WAY]: 1,
  [OrderStatus.CASH_COLLECTED]: 2,
  [OrderStatus.PAID]: 3,
  [OrderStatus.DELIVERED]: 4,
  [OrderStatus.CANCELLED]: 5,
  [OrderStatus.REJECTED]: 6,
  [OrderStatus.PENDING_PROVIDER]: 7,
  [OrderStatus.REFUNDED]: 5,
});

/**
 * Pedidos activos para el cliente (activeOrder del prototipo): aún esperan algo.
 * El resto aparece en "Historial y facturas anteriores".
 */
const CUSTOMER_ACTIVE = new Set([OrderStatus.REQUESTED, OrderStatus.ON_THE_WAY, OrderStatus.CASH_COLLECTED, OrderStatus.PENDING_PROVIDER]);
export const isCustomerActive = (status) => CUSTOMER_ACTIVE.has(status);

const LABELS = ['Solicitado', 'En camino', 'Efectivo recogido', 'Pagado', 'Entregado', 'Cancelado', 'Pago rechazado', 'Pago pendiente'];

/** Mensajes al cliente por estado (MSG del prototipo). `{op}` = nombre del domiciliario. */
const MESSAGES = [
  'Recibimos tu pedido. {op} te confirmará pronto.',
  '{op} va en camino a tu casa 🏍️',
  'Recogimos tu efectivo y factura. Estamos haciendo el trámite.',
  '¡Trámite realizado! Te llevamos el comprobante.',
  'Comprobante entregado. ¡Gracias por confiar en ChochoPagos!',
  'Este pedido fue cancelado antes de recibir el efectivo.',
  'El proveedor rechazó el pago. Revisa los datos o solicita ayuda.',
  'El proveedor aún no confirma el pago. El Centro hará seguimiento.',
];

export const statusLabel = (status) => (status === OrderStatus.REFUNDED ? 'Efectivo devuelto' : LABELS[STATUS_INDEX[status]] ?? status);

export const statusMessage = (status, operatorName) =>
  status === OrderStatus.REFUNDED
    ? `${operatorName} te devolvió el efectivo de este pedido.`
    : (MESSAGES[STATUS_INDEX[status]] ?? '').replaceAll('{op}', operatorName);

/** Aviso al cliente cuando su pedido cambia de estado. */
export function statusChangeMessage(order, operatorName) {
  const base = `Tu pedido #${order.id}: ${statusMessage(order.status, operatorName)}`;
  return order.status === OrderStatus.DELIVERED ? `${base}\n\n${receiptText(order)}` : base;
}

const VIA = { wallet: 'Monedero (autopago)', operator: 'App del domiciliario', center: 'Centro Comunitario' };
export const paidViaLabel = (paidVia) => VIA[paidVia] ?? '—';

/** Comprobante en texto (mismo contenido que recibo() del prototipo). */
export function receiptText(order) {
  return [
    `*COMPROBANTE #${order.id}*`,
    order.displayName,
    `Ref: ${order.reference || '—'}`,
    `Valor: ${formatCOP(order.amount)} · Comisión: ${formatCOP(order.fee)}`,
    `Domicilio: ${formatCOP(order.deliveryFee)}`,
    `*Total: ${formatCOP(order.total)}*`,
    `Vía: ${paidViaLabel(order.paidVia)} · CHO-${2600 + order.id}`,
  ].join('\n');
}

export function orderLine(order) {
  return `*#${order.id}* ${order.displayName} · ${statusLabel(order.status)} · ${formatCOP(order.total)}`;
}

/**
 * Representación JSON para la API (DTO). No expone `version` ni, salvo al propio
 * cliente, el código de entrega.
 * @param {import('../domain/order.js').Order} order
 * @param {{ customer?: { name: string, sector: string, address: string } | null, includeCode?: boolean }} [options]
 */
export function orderDto(order, { customer = null, includeCode = false } = {}) {
  const service = order.service;
  return {
    id: order.id,
    customerPhone: order.customerPhone,
    customer,
    service: { code: order.serviceCode, name: service.name, icon: service.icon, requirements: service.requirements },
    provider: order.provider,
    displayName: order.displayName,
    reference: order.reference,
    fields: order.fields,
    missingFields: order.missingFields,
    amount: order.amount,
    fee: order.fee,
    deliveryFee: order.deliveryFee,
    total: order.total,
    status: order.status,
    statusIndex: STATUS_INDEX[order.status],
    statusLabel: statusLabel(order.status),
    arrived: order.arrived,
    operationVerified: order.operationVerified,
    paidVia: order.paidVia,
    paidViaLabel: paidViaLabel(order.paidVia),
    settled: order.settled,
    failureReason: order.failureReason,
    receiptPhoto: order.receiptPath ?? null,
    evidencePhoto: order.evidenceUrl ?? null,
    deliveryCode: includeCode ? order.deliveryCode : undefined,
    channel: order.channel,
    operatorId: order.operatorId,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
  };
}
