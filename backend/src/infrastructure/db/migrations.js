/**
 * Migraciones versionadas. Nunca edites una ya publicada: agrega una nueva.
 */
export const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE users (
        phone        TEXT PRIMARY KEY,           -- E.164 sin "+": 573128889900
        name         TEXT NOT NULL,
        document     TEXT,
        sector       TEXT NOT NULL,
        address      TEXT NOT NULL,
        consent_at   TEXT NOT NULL,              -- autorización de tratamiento de datos (Ley 1581)
        created_at   TEXT NOT NULL
      );

      CREATE TABLE orders (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_phone   TEXT NOT NULL REFERENCES users(phone),
        service_code     TEXT NOT NULL,
        provider         TEXT NOT NULL DEFAULT '',
        reference        TEXT NOT NULL DEFAULT '',
        fields_json      TEXT NOT NULL DEFAULT '{}',
        amount           INTEGER NOT NULL CHECK (amount >= 0),
        fee              INTEGER NOT NULL CHECK (fee >= 0),
        delivery_fee     INTEGER NOT NULL CHECK (delivery_fee >= 0),
        status           TEXT NOT NULL,
        delivery_code    TEXT NOT NULL,
        arrived          INTEGER NOT NULL DEFAULT 0,
        receipt_verified INTEGER NOT NULL DEFAULT 0,
        paid_via         TEXT,
        settled          INTEGER NOT NULL DEFAULT 0,
        failure_reason   TEXT,
        receipt_path     TEXT,
        evidence_url     TEXT,
        channel          TEXT NOT NULL,
        operator_id      TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        delivered_at     TEXT,
        cancelled_at     TEXT,
        version          INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_orders_customer ON orders(customer_phone, created_at);
      CREATE INDEX idx_orders_status ON orders(status);

      -- Libro de movimientos de solo inserción: los saldos se calculan sumando.
      CREATE TABLE ledger_entries (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        role        TEXT NOT NULL,
        account     TEXT NOT NULL,
        owner       TEXT NOT NULL,
        concept     TEXT NOT NULL,
        amount      INTEGER NOT NULL,
        order_id    INTEGER REFERENCES orders(id),
        created_at  TEXT NOT NULL
      );
      CREATE INDEX idx_ledger_account ON ledger_entries(role, account, owner);
      CREATE INDEX idx_ledger_order ON ledger_entries(order_id);

      -- Recargas de monedero en efectivo; las del operador quedan pendientes de rendir.
      CREATE TABLE wallet_topups (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_phone TEXT NOT NULL REFERENCES users(phone),
        amount         INTEGER NOT NULL CHECK (amount > 0),
        channel        TEXT NOT NULL,
        operator_id    TEXT,
        settled        INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL
      );

      -- Estado de la conversación de WhatsApp por número.
      CREATE TABLE chat_sessions (
        phone       TEXT PRIMARY KEY,
        state_json  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      -- Idempotencia: Meta puede reenviar el mismo webhook varias veces.
      CREATE TABLE inbound_messages (
        message_id  TEXT PRIMARY KEY,
        phone       TEXT NOT NULL,
        received_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      -- PIN de 4 dígitos del cliente (scrypt con sal), para entrar a la app y pagar con saldo.
      ALTER TABLE users ADD COLUMN pin_hash TEXT;

      -- El domiciliario verificó y completó los datos de la operación antes de pagar.
      ALTER TABLE orders ADD COLUMN operation_verified INTEGER NOT NULL DEFAULT 0;

      -- Transcripción de la conversación (WhatsApp y chat web comparten historial).
      CREATE TABLE chat_messages (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        phone        TEXT NOT NULL,
        direction    TEXT NOT NULL CHECK (direction IN ('in', 'out')),
        channel      TEXT NOT NULL,
        message_json TEXT NOT NULL,
        created_at   TEXT NOT NULL
      );
      CREATE INDEX idx_chat_phone ON chat_messages(phone, id);
    `,
  },
  {
    version: 3,
    sql: `
      -- Oculta los PIN que versiones anteriores dejaron en el historial del chat:
      -- mensajes de 4 dígitos escritos justo después de que el asistente pidiera un PIN.
      UPDATE chat_messages
      SET message_json = '{"type":"text","body":"••••","secret":true}'
      WHERE direction = 'in'
        AND json_extract(message_json, '$.body') GLOB '[0-9][0-9][0-9][0-9]'
        AND (
          SELECT json_extract(prev.message_json, '$.body') FROM chat_messages prev
          WHERE prev.phone = chat_messages.phone AND prev.id < chat_messages.id
          ORDER BY prev.id DESC LIMIT 1
        ) LIKE '%PIN%';
    `,
  },
  {
    version: 4,
    sql: `
      -- Telegram no entrega el celular: se vincula una vez, cuando la persona comparte su contacto.
      CREATE TABLE telegram_links (
        chat_id    TEXT PRIMARY KEY,
        phone      TEXT NOT NULL UNIQUE,
        linked_at  TEXT NOT NULL
      );
    `,
  },
];
