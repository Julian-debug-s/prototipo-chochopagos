/** Persistencia del estado de cada conversación (Telegram y app web). */
export function createSessionRepository(database) {
  const db = database.raw;
  const get = db.prepare('SELECT state_json, updated_at FROM chat_sessions WHERE phone = ?');
  const upsert = db.prepare(`INSERT INTO chat_sessions (phone, state_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`);
  const remove = db.prepare('DELETE FROM chat_sessions WHERE phone = ?');

  return {
    /** @returns {{ state: object, updatedAt: Date } | null} */
    find(phone) {
      const row = get.get(phone);
      return row ? { state: JSON.parse(row.state_json), updatedAt: new Date(row.updated_at) } : null;
    },
    save(phone, state, now) {
      upsert.run(phone, JSON.stringify(state), now.toISOString());
    },
    delete(phone) {
      remove.run(phone);
    },
  };
}

/** Historial de la conversación, compartido entre Telegram y el chat web. */
export function createTranscriptRepository(database) {
  const db = database.raw;
  const insert = db.prepare('INSERT INTO chat_messages (phone, direction, channel, message_json, created_at) VALUES (?, ?, ?, ?, ?)');
  const after = db.prepare('SELECT * FROM chat_messages WHERE phone = ? AND id > ? ORDER BY id LIMIT ?');
  const latest = db.prepare('SELECT * FROM (SELECT * FROM chat_messages WHERE phone = ? ORDER BY id DESC LIMIT ?) ORDER BY id');

  const toEntry = (r) => ({ id: r.id, direction: r.direction, channel: r.channel, message: JSON.parse(r.message_json), createdAt: r.created_at });

  return {
    /** @param {'in'|'out'} direction */
    append(phone, direction, channel, message, now) {
      return Number(insert.run(phone, direction, channel, JSON.stringify(message), now.toISOString()).lastInsertRowid);
    },
    /** Mensajes posteriores a `afterId`, o los últimos `limit` si afterId es 0. */
    list(phone, { afterId = 0, limit = 60 } = {}) {
      return (afterId ? after.all(phone, afterId, limit) : latest.all(phone, limit)).map(toEntry);
    },
  };
}

/** Registro de mensajes ya procesados (idempotencia de mensajes entrantes). */
export function createInboxRepository(database) {
  const db = database.raw;
  const insert = db.prepare('INSERT OR IGNORE INTO inbound_messages (message_id, phone, received_at) VALUES (?, ?, ?)');

  return {
    /** @returns {boolean} true si es la primera vez que se ve este mensaje. */
    markReceived(messageId, phone, now) {
      return insert.run(messageId, phone, now.toISOString()).changes === 1;
    },
  };
}
