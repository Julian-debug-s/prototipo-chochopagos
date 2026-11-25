/**
 * Mensajes salientes independientes del canal. El adaptador de Telegram los
 * convierte al formato del bot y la app web los pinta con la estética del prototipo.
 *
 * @typedef {{ type: 'text', body: string }} TextMessage
 * @typedef {{ id: string, title: string }} Button
 * @typedef {{ type: 'buttons', body: string, buttons: Button[] }} ButtonsMessage
 * @typedef {{ id: string, title: string, description?: string }} ListRow
 * @typedef {{ type: 'list', body: string, button: string, sections: { title: string, rows: ListRow[] }[] }} ListMessage
 * @typedef {TextMessage | ButtonsMessage | ListMessage} OutgoingMessage
 */

/** @returns {TextMessage} */
export const text = (body) => ({ type: 'text', body });

/** Máximo 3 botones: se leen bien en el celular y en la app. @returns {ButtonsMessage} */
export const buttons = (body, items) => {
  if (items.length > 3) throw new Error('Máximo 3 botones por mensaje');
  return { type: 'buttons', body, buttons: items };
};

/** Máximo 10 opciones por lista. @returns {ListMessage} */
export const list = (body, button, sections) => {
  const rows = sections.reduce((n, s) => n + s.rows.length, 0);
  if (rows > 10) throw new Error('Máximo 10 filas por lista');
  return { type: 'list', body, button, sections };
};

/** Identificadores de respuestas interactivas (contrato entre mensajes, flujo y app web). */
export const Reply = Object.freeze({
  NEW: 'new',
  ORDERS: 'orders',
  BALANCE: 'balance',
  MENU: 'menu',
  CONFIRM: 'confirm:yes',
  WALLET: 'confirm:wallet',
  EDIT: 'confirm:edit',
  CONSENT_YES: 'consent:yes',
  CONSENT_NO: 'consent:no',
  category: (id) => `cat:${id}`,
  service: (code) => `svc:${code}`,
  provider: (i) => `prov:${i}`,
  pkg: (i) => `pkg:${i}`,
  mode: (m) => `mode:${m}`,
  sector: (i) => `sector:${i}`,
  cancelOrder: (id) => `order:cancel:${id}`,
});

/** "cat:utilities" -> ["cat", "utilities"] */
export function parseReplyId(id) {
  if (!id) return [null, null];
  const i = id.indexOf(':');
  return i < 0 ? [id, null] : [id.slice(0, i), id.slice(i + 1)];
}
