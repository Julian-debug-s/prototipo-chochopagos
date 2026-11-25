import { platformRechargeEntries, walletTopUpEntries } from '../../domain/accounting.js';
import { hashPin } from '../../shared/security.js';

const DEMO_USERS = [
  { phone: '573128889900', name: 'Rosa Giraldo', document: '43987654', sector: 'Alto del Chocho', address: 'Finca La Esperanza, junto a la droguería' },
  { phone: '573104567890', name: 'Jairo Henao', document: '70123456', sector: 'Alto del Chocho', address: 'Casa azul frente a la escuela' },
];

/**
 * Datos de demostración, iguales a los del prototipo: Rosa y Jairo (PIN 1234),
 * $500.000 de saldo de plataforma y $50.000 en el monedero de Rosa.
 * Solo se cargan si la base no tiene usuarios.
 */
export function seedDemoData({ database, users, ledger, topUps, clock }) {
  if (users.list().length > 0) return false;
  const now = clock();
  database.transaction(() => {
    for (const u of DEMO_USERS) users.insert({ ...u, pinHash: hashPin('1234'), consentAt: now, createdAt: now });
    ledger.append(platformRechargeEntries(500_000).map((e) => ({ ...e, concept: 'Saldo inicial de la plataforma' })), now);
    topUps.insert({ customerPhone: '573128889900', amount: 50_000, channel: 'center', now });
    ledger.append(walletTopUpEntries({ customerPhone: '573128889900', customerName: 'Rosa Giraldo', amount: 50_000, channel: 'center' })
      .map((e) => ({ ...e, concept: e.role === 'customer' ? 'Saldo inicial del monedero (demo)' : e.concept })), now);
  });
  return true;
}

/** Borra todos los datos (solo para "Reiniciar demo" en desarrollo). */
export function wipeAllData(database) {
  database.transaction(() => {
    for (const table of ['ledger_entries', 'wallet_topups', 'chat_messages', 'chat_sessions', 'inbound_messages', 'orders', 'users']) {
      database.raw.exec(`DELETE FROM ${table}`);
    }
    database.raw.exec("DELETE FROM sqlite_sequence WHERE name IN ('orders', 'ledger_entries', 'wallet_topups', 'chat_messages')");
  });
}
