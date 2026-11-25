import { OrderEvents } from './orderService.js';
import { FinanceEvents } from './financeService.js';
import { statusChangeMessage } from './presenters.js';
import { formatCOP } from '../domain/money.js';

/**
 * Traduce eventos del negocio en avisos al cliente (patrón Observer).
 * Usa `notify` del servicio de chat: el aviso sale por Telegram y queda en el
 * historial que también ve la app.
 *
 * @param {{ events: import('../shared/eventBus.js').EventBus, notify: (to: string, message: object) => Promise<void>, operatorName: string }} deps
 */
export function registerNotifications({ events, notify, operatorName }) {
  const say = (to, body) => notify(to, { type: 'text', body });

  events.subscribe(OrderEvents.STATUS_CHANGED, async ({ order, actor }) => {
    // Si el propio cliente hizo el cambio (p. ej. canceló), ya recibió respuesta en el chat.
    if (actor === 'customer') return;
    await say(order.customerPhone, statusChangeMessage(order, operatorName));
  });

  events.subscribe(OrderEvents.ARRIVED, async ({ order }) => {
    await say(order.customerPhone, `🏠 ${operatorName} llegó a tu casa por el pedido #${order.id}. Entrégale ${formatCOP(order.total)} y dile tu código de entrega *${order.deliveryCode}*.`);
  });

  events.subscribe(FinanceEvents.WALLET_TOPPED_UP, async ({ customerPhone, amount }) => {
    await say(customerPhone, `Tu cuenta fue recargada con ${formatCOP(amount)}. 👛`);
  });
}
