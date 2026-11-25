import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Order, OrderStatus } from '../src/domain/order.js';
import { cashCollectedEntries, paymentApprovedEntries, deliveredEntries, Role, Account } from '../src/domain/accounting.js';
import { DomainError, ValidationError } from '../src/shared/errors.js';
import { normalizeColombianMobile } from '../src/domain/phone.js';

const now = new Date('2026-11-09T12:00:00Z');
const energy = () => {
  const o = Order.create({ customerPhone: '573128889900', serviceCode: 'energy', provider: 'EPM', fields: { reference: '4471290' }, amount: 85000, deliveryFee: 3000, deliveryCode: '4821', now });
  o.id = 1;
  return o;
};
const sum = (entries, role, account) => entries.filter((e) => e.role === role && e.account === account).reduce((s, e) => s + e.amount, 0);

describe('Order', () => {
  test('calcula el total: valor + comisión + domicilio', () => {
    assert.equal(energy().total, 89500);
    assert.equal(energy().settlementAmount, 86500);
  });

  test('recorre el camino feliz hasta DELIVERED', () => {
    const o = energy();
    o.accept('OP-01', now);
    o.markArrived(now);
    o.collectCash({ cashReceived: 89500, customerCode: '4821', receiptVerified: true }, now);
    assert.throws(() => o.applyPaymentResult('approved', 'operator', now), { code: 'OPERATION_NOT_VERIFIED' });
    o.completeOperationData({ reference: '4471290' }, now);
    o.applyPaymentResult('approved', 'operator', now);
    o.deliver(now);
    assert.equal(o.status, OrderStatus.DELIVERED);
  });

  test('rechaza transiciones inválidas', () => {
    const o = energy();
    assert.throws(() => o.deliver(now), (e) => e instanceof DomainError && e.code === 'INVALID_TRANSITION');
  });

  test('exige el efectivo exacto y el código del cliente', () => {
    const o = energy();
    o.accept('OP-01', now);
    o.markArrived(now);
    assert.throws(() => o.collectCash({ cashReceived: 80000, customerCode: '4821', receiptVerified: true }, now), { code: 'CASH_MISMATCH' });
    assert.throws(() => o.collectCash({ cashReceived: 89500, customerCode: '0000', receiptVerified: true }, now), { code: 'INVALID_DELIVERY_CODE' });
    assert.equal(o.status, OrderStatus.ON_THE_WAY);
  });

  test('no se puede cancelar después de recibir el efectivo', () => {
    const o = energy();
    o.accept('OP-01', now);
    o.markArrived(now);
    o.collectCash({ cashReceived: 89500, customerCode: '4821', receiptVerified: true }, now);
    assert.throws(() => o.cancel('customer', now), { code: 'NOT_CANCELLABLE' });
  });

  test('valida proveedor, valor y campos obligatorios al crear', () => {
    const base = { customerPhone: '573128889900', serviceCode: 'energy', provider: 'EPM', fields: { reference: '1' }, amount: 85000, deliveryFee: 3000, deliveryCode: '1', now };
    assert.throws(() => Order.create({ ...base, provider: 'Otra' }), ValidationError);
    assert.throws(() => Order.create({ ...base, amount: 500 }), ValidationError);
    assert.throws(() => Order.create({ ...base, fields: {} }), ValidationError);
  });

  test('con foto del recibo, el domiciliario completa los datos después', () => {
    const o = Order.create({ customerPhone: '573128889900', serviceCode: 'soat', fields: {}, amount: 285000, deliveryFee: 3000, deliveryCode: '1', receiptPath: 'x.jpg', now });
    assert.deepEqual(o.missingFields, ['Placa del vehículo', 'Documento del propietario']);
  });

  test('autopago con saldo: sin domicilio y entregado de inmediato', () => {
    const o = Order.createSelfPaid({ customerPhone: '573128889900', serviceCode: 'water', provider: 'Aguas de Marinilla', fields: { reference: '1' }, amount: 42300, now });
    assert.equal(o.status, OrderStatus.DELIVERED);
    assert.equal(o.total, 43800);
    assert.throws(() => Order.createSelfPaid({ customerPhone: '573128889900', serviceCode: 'civil_registry', fields: {}, now }), { code: 'NOT_SELF_PAYABLE' });
  });

  test('los trámites de valor fijo ignoran el valor recibido', () => {
    const o = Order.create({ customerPhone: '573128889900', serviceCode: 'civil_registry', fields: { personName: 'Ana', birthDate: '1990-01-01', document: '123456' }, amount: 1, deliveryFee: 3000, deliveryCode: '1', now });
    assert.equal(o.amount, 10000);
  });
});

describe('Contabilidad', () => {
  test('el dinero se conserva: lo que paga el cliente se reparte sin perder un peso', () => {
    const o = energy();
    o.operatorId = 'OP-01';
    const all = [...cashCollectedEntries(o), ...paymentApprovedEntries(o, 'operator'), ...deliveredEntries(o)];
    assert.equal(sum(all, Role.CUSTOMER, Account.PAYMENTS), -89500);
    assert.equal(sum(all, Role.OPERATOR, Account.CASH), 86500); // pendiente de rendir al Centro
    assert.equal(sum(all, Role.OPERATOR, Account.EARNINGS), 3000);
    assert.equal(sum(all, Role.CENTER, Account.PLATFORM), -85000);
    assert.equal(sum(all, Role.CENTER, Account.COMMISSIONS), 1500);
  });
});

test('normaliza celulares colombianos', () => {
  assert.equal(normalizeColombianMobile('312 888 9900'), '573128889900');
  assert.equal(normalizeColombianMobile('+57 3128889900'), '573128889900');
  assert.equal(normalizeColombianMobile('6041234567'), null);
});
