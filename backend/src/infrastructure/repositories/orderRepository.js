import { Order } from '../../domain/order.js';
import { ConcurrencyError } from '../../shared/errors.js';

const COLUMNS = `customer_phone, service_code, provider, reference, fields_json, amount, fee, delivery_fee, status,
  delivery_code, arrived, receipt_verified, operation_verified, paid_via, settled, failure_reason, receipt_path, evidence_url, channel,
  operator_id, created_at, updated_at, delivered_at, cancelled_at, version`;

/** @param {import('../db/database.js').Database} database */
export function createOrderRepository(database) {
  const db = database.raw;
  const insertStmt = db.prepare(`INSERT INTO orders (${COLUMNS}) VALUES (
    $customerPhone, $serviceCode, $provider, $reference, $fieldsJson, $amount, $fee, $deliveryFee, $status,
    $deliveryCode, $arrived, $receiptVerified, $operationVerified, $paidVia, $settled, $failureReason, $receiptPath, $evidenceUrl, $channel,
    $operatorId, $createdAt, $updatedAt, $deliveredAt, $cancelledAt, 0)`);
  // Bloqueo optimista: solo actualiza si nadie cambió la fila desde que se leyó.
  const updateStmt = db.prepare(`UPDATE orders SET
      provider=$provider, reference=$reference, fields_json=$fieldsJson, amount=$amount, fee=$fee, delivery_fee=$deliveryFee,
      status=$status, delivery_code=$deliveryCode, arrived=$arrived, receipt_verified=$receiptVerified, operation_verified=$operationVerified, paid_via=$paidVia,
      settled=$settled, failure_reason=$failureReason, receipt_path=$receiptPath, evidence_url=$evidenceUrl,
      operator_id=$operatorId, updated_at=$updatedAt, delivered_at=$deliveredAt, cancelled_at=$cancelledAt,
      version = version + 1
    WHERE id = $id AND version = $version`);
  const byId = db.prepare('SELECT * FROM orders WHERE id = ?');
  const byCustomer = db.prepare('SELECT * FROM orders WHERE customer_phone = ? ORDER BY created_at DESC, id DESC LIMIT ?');

  return {
    /** @param {Order} order  Asigna `id` al pedido. */
    insert(order) {
      const result = insertStmt.run(toParams(order));
      order.id = Number(result.lastInsertRowid);
      order.version = 0;
      return order;
    },

    /** @param {Order} order */
    update(order) {
      // Campos inmutables tras la creación: no se envían al UPDATE.
      const { customerPhone, serviceCode, channel, createdAt, ...mutable } = toParams(order);
      const result = updateStmt.run({ ...mutable, id: order.id, version: order.version });
      if (result.changes !== 1) throw new ConcurrencyError('Pedido', order.id);
      order.version += 1;
      return order;
    },

    /** @returns {Order|null} */
    findById(id) {
      const row = byId.get(id);
      return row ? toOrder(row) : null;
    },

    /** @returns {Order[]} */
    findByCustomer(phone, limit = 10) {
      return byCustomer.all(phone, limit).map(toOrder);
    },

    /**
     * @param {{ statuses?: string[], settled?: boolean, paidVia?: string, operatorId?: string, limit?: number }} [filter]
     * @returns {Order[]}
     */
    search({ statuses, settled, paidVia, operatorId, limit = 200 } = {}) {
      const where = [];
      const params = [];
      if (statuses?.length) { where.push(`status IN (${statuses.map(() => '?').join(',')})`); params.push(...statuses); }
      if (settled !== undefined) { where.push('settled = ?'); params.push(settled ? 1 : 0); }
      if (paidVia) { where.push('paid_via = ?'); params.push(paidVia); }
      if (operatorId) { where.push('operator_id = ?'); params.push(operatorId); }
      const sql = `SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC LIMIT ?`;
      return db.prepare(sql).all(...params, limit).map(toOrder);
    },
  };
}

const iso = (d) => (d ? d.toISOString() : null);
const date = (s) => (s ? new Date(s) : null);

function toParams(o) {
  return {
    customerPhone: o.customerPhone, serviceCode: o.serviceCode, provider: o.provider, reference: o.reference,
    fieldsJson: JSON.stringify(o.fields ?? {}), amount: o.amount, fee: o.fee, deliveryFee: o.deliveryFee, status: o.status,
    deliveryCode: o.deliveryCode, arrived: o.arrived ? 1 : 0, receiptVerified: o.receiptVerified ? 1 : 0, operationVerified: o.operationVerified ? 1 : 0, paidVia: o.paidVia,
    settled: o.settled ? 1 : 0, failureReason: o.failureReason, receiptPath: o.receiptPath, evidenceUrl: o.evidenceUrl,
    channel: o.channel, operatorId: o.operatorId, createdAt: iso(o.createdAt), updatedAt: iso(o.updatedAt),
    deliveredAt: iso(o.deliveredAt), cancelledAt: iso(o.cancelledAt),
  };
}

function toOrder(r) {
  return new Order({
    id: r.id, customerPhone: r.customer_phone, serviceCode: r.service_code, provider: r.provider, reference: r.reference,
    fields: JSON.parse(r.fields_json), amount: r.amount, fee: r.fee, deliveryFee: r.delivery_fee, status: r.status,
    deliveryCode: r.delivery_code, arrived: Boolean(r.arrived), receiptVerified: Boolean(r.receipt_verified), operationVerified: Boolean(r.operation_verified), paidVia: r.paid_via,
    settled: Boolean(r.settled), failureReason: r.failure_reason, receiptPath: r.receipt_path, evidenceUrl: r.evidence_url,
    channel: r.channel, operatorId: r.operator_id, createdAt: date(r.created_at), updatedAt: date(r.updated_at),
    deliveredAt: date(r.delivered_at), cancelledAt: date(r.cancelled_at), version: r.version,
  });
}
