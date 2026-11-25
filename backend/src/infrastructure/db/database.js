import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MIGRATIONS } from './migrations.js';

/**
 * Abre la base SQLite (módulo nativo de Node, sin dependencias compiladas),
 * aplica migraciones pendientes y expone un helper de transacciones.
 *
 * @param {string} path  ruta del archivo o ":memory:"
 */
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);

  let depth = 0;

  return {
    /** Acceso directo para los repositorios. */
    raw: db,

    /**
     * Ejecuta `fn` dentro de una transacción. Las transacciones anidadas se
     * integran a la externa (todo o nada). `fn` debe ser síncrona: node:sqlite
     * es síncrono, así que una transacción nunca queda abierta esperando red.
     * @template T @param {() => T} fn @returns {T}
     */
    transaction(fn) {
      if (depth > 0) return fn();
      db.exec('BEGIN IMMEDIATE');
      depth++;
      try {
        const result = fn();
        if (result instanceof Promise) throw new Error('transaction() no acepta funciones asíncronas');
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        depth--;
      }
    },

    close: () => db.close(),
  };
}

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  for (const { version, sql } of MIGRATIONS) {
    if (applied.has(version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** @typedef {ReturnType<typeof openDatabase>} Database */
