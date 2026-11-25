/**
 * @typedef {{ phone: string, name: string, document: string|null, sector: string, address: string, pinHash: string|null, consentAt: Date, createdAt: Date }} User
 */

/** @param {import('../db/database.js').Database} database */
export function createUserRepository(database) {
  const db = database.raw;
  const byPhone = db.prepare('SELECT * FROM users WHERE phone = ?');
  const insert = db.prepare(`INSERT INTO users (phone, name, document, sector, address, pin_hash, consent_at, created_at)
    VALUES ($phone, $name, $document, $sector, $address, $pinHash, $consentAt, $createdAt)`);
  const all = db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM orders o WHERE o.customer_phone = u.phone) AS order_count
    FROM users u ORDER BY u.name`);

  return {
    /** @returns {User|null} */
    findByPhone(phone) {
      const row = byPhone.get(phone);
      return row ? toUser(row) : null;
    },

    /** @param {User} user */
    insert(user) {
      insert.run({
        phone: user.phone, name: user.name, document: user.document ?? null, sector: user.sector,
        address: user.address, pinHash: user.pinHash ?? null, consentAt: user.consentAt.toISOString(), createdAt: user.createdAt.toISOString(),
      });
      return user;
    },

    /** @returns {(User & { orderCount: number })[]} */
    list() {
      return all.all().map((row) => ({ ...toUser(row), orderCount: Number(row.order_count) }));
    },
  };
}

function toUser(row) {
  return {
    phone: row.phone, name: row.name, document: row.document, sector: row.sector, address: row.address,
    pinHash: row.pin_hash ?? null, consentAt: new Date(row.consent_at), createdAt: new Date(row.created_at),
  };
}
