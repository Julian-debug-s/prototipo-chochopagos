/** @param {import('../db/database.js').Database} database */
export function createLedgerRepository(database) {
  const db = database.raw;
  const insert = db.prepare(`INSERT INTO ledger_entries (role, account, owner, concept, amount, order_id, created_at)
    VALUES ($role, $account, $owner, $concept, $amount, $orderId, $createdAt)`);
  const balance = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_entries WHERE role = ? AND account = ? AND owner = ?');

  return {
    /** @param {import('../../domain/accounting.js').LedgerEntryDraft[]} entries @param {Date} now */
    append(entries, now) {
      for (const e of entries) {
        insert.run({ role: e.role, account: e.account, owner: e.owner, concept: e.concept, amount: e.amount, orderId: e.orderId ?? null, createdAt: now.toISOString() });
      }
    },

    /** @returns {number} */
    balance(role, account, owner) {
      return Number(balance.get(role, account, owner).total);
    },

    /** Saldos de todas las cuentas de un dueño: { cash: 12000, earnings: 3000 } */
    balancesFor(role, owner) {
      const rows = db.prepare('SELECT account, SUM(amount) AS total FROM ledger_entries WHERE role = ? AND owner = ? GROUP BY account').all(role, owner);
      return Object.fromEntries(rows.map((r) => [r.account, Number(r.total)]));
    },

    /** Movimientos más recientes primero. */
    list({ role, owner, account, limit = 50 } = {}) {
      const where = [];
      const params = [];
      if (role) { where.push('role = ?'); params.push(role); }
      if (owner) { where.push('owner = ?'); params.push(owner); }
      if (account) { where.push('account = ?'); params.push(account); }
      const sql = `SELECT * FROM ledger_entries ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
      return db.prepare(sql).all(...params, limit).map((r) => ({
        id: r.id, role: r.role, account: r.account, owner: r.owner, concept: r.concept, amount: r.amount, orderId: r.order_id, createdAt: r.created_at,
      }));
    },
  };
}
