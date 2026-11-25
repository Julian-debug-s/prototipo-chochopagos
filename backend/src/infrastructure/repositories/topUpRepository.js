/** @param {import('../db/database.js').Database} database */
export function createTopUpRepository(database) {
  const db = database.raw;
  const insert = db.prepare(`INSERT INTO wallet_topups (customer_phone, amount, channel, operator_id, settled, created_at)
    VALUES ($customerPhone, $amount, $channel, $operatorId, $settled, $createdAt)`);
  const unsettled = db.prepare("SELECT * FROM wallet_topups WHERE channel = 'operator' AND operator_id = ? AND settled = 0");
  const settle = db.prepare('UPDATE wallet_topups SET settled = 1 WHERE id = ? AND settled = 0');

  return {
    insert({ customerPhone, amount, channel, operatorId = null, now }) {
      const result = insert.run({ customerPhone, amount, channel, operatorId, settled: channel === 'operator' ? 0 : 1, createdAt: now.toISOString() });
      return Number(result.lastInsertRowid);
    },

    /** Recargas recibidas por el operador que aún no entregó en el Centro. */
    findUnsettledByOperator(operatorId) {
      return unsettled.all(operatorId).map((r) => ({ id: r.id, amount: r.amount, customerPhone: r.customer_phone }));
    },

    markSettled(ids) {
      for (const id of ids) settle.run(id);
    },
  };
}
