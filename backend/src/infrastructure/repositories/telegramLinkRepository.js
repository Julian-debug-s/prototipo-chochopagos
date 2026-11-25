/** Vínculo entre un chat de Telegram y el celular del cliente. */
export function createTelegramLinkRepository(database) {
  const db = database.raw;
  const byChat = db.prepare('SELECT phone FROM telegram_links WHERE chat_id = ?');
  const byPhone = db.prepare('SELECT chat_id FROM telegram_links WHERE phone = ?');
  const removeEither = db.prepare('DELETE FROM telegram_links WHERE chat_id = ? OR phone = ?');
  const insert = db.prepare('INSERT INTO telegram_links (chat_id, phone, linked_at) VALUES (?, ?, ?)');

  return {
    /** @returns {string|null} */
    phoneFor: (chatId) => byChat.get(String(chatId))?.phone ?? null,

    /** @returns {string|null} */
    chatFor: (phone) => byPhone.get(phone)?.chat_id ?? null,

    /** Un chat tiene un solo celular y un celular un solo chat: el vínculo nuevo reemplaza al anterior. */
    link(chatId, phone, now) {
      database.transaction(() => {
        removeEither.run(String(chatId), phone);
        insert.run(String(chatId), phone, now.toISOString());
      });
    },
  };
}
