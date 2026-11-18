import "server-only";
import path from "path";
import fs from "fs";
import { seedCatalogue, seedSettings } from "@/lib/seed";

/* node:sqlite is built into Node 22. We load it through the real Node require so webpack does not try to bundle it. */
declare const __non_webpack_require__: NodeRequire;
type Stmt = {
  run: (...p: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
  get: (...p: unknown[]) => Record<string, unknown> | undefined;
  all: (...p: unknown[]) => Record<string, unknown>[];
};
export type DB = { exec: (sql: string) => void; prepare: (sql: string) => Stmt; close: () => void };

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");
export const RECEIPT_DIR = path.join(DATA_DIR, "receipts");

const g = globalThis as unknown as { __wxdb?: DB };

const MIGRATIONS: string[] = [
  `CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('single','combo')),
    category TEXT NOT NULL,
    short_description TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    information TEXT NOT NULL DEFAULT '',
    ingredients TEXT NOT NULL DEFAULT '',
    directions TEXT NOT NULL DEFAULT '',
    faqs TEXT NOT NULL DEFAULT '[]',
    images TEXT NOT NULL DEFAULT '[]',
    related TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft',
    featured INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    review_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    size TEXT NOT NULL DEFAULT '',
    duration TEXT NOT NULL DEFAULT '',
    sku TEXT NOT NULL UNIQUE,
    price INTEGER NOT NULL,
    sale_price INTEGER,
    stock INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    needs_confirmation INTEGER NOT NULL DEFAULT 0,
    price_source TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE combo_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    combo_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    item_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    item_name TEXT NOT NULL,
    size_note TEXT NOT NULL DEFAULT '',
    quantity_note TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    whatsapp TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    subtotal INTEGER NOT NULL,
    delivery_fee INTEGER,
    total INTEGER,
    payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
    payment_status TEXT NOT NULL DEFAULT 'pending_payment',
    fulfilment_status TEXT NOT NULL DEFAULT 'unfulfilled',
    payment_reference TEXT NOT NULL DEFAULT '',
    payer_name TEXT NOT NULL DEFAULT '',
    payment_note TEXT NOT NULL DEFAULT '',
    receipt_path TEXT NOT NULL DEFAULT '',
    payment_submitted_at TEXT,
    paid_at TEXT,
    verified_by TEXT NOT NULL DEFAULT '',
    admin_notes TEXT NOT NULL DEFAULT '',
    bank_snapshot TEXT NOT NULL DEFAULT '{}',
    purchase_event_id TEXT NOT NULL DEFAULT '',
    purchase_event_status TEXT NOT NULL DEFAULT '',
    tracking TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX idx_orders_created ON orders(created_at);
  CREATE INDEX idx_orders_pay ON orders(payment_status);
  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER,
    variant_id INTEGER,
    name TEXT NOT NULL,
    variant_label TEXT NOT NULL,
    sku TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    qty INTEGER NOT NULL,
    line_total INTEGER NOT NULL
  );
  CREATE TABLE order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    at TEXT NOT NULL DEFAULT (datetime('now')),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE delivery_zones (
    state TEXT PRIMARY KEY,
    fee INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner','staff')),
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
];

function open(): DB {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  fs.mkdirSync(RECEIPT_DIR, { recursive: true });
  const req = typeof __non_webpack_require__ === "function" ? __non_webpack_require__ : require;
  const { DatabaseSync } = req("node:sqlite") as { DatabaseSync: new (p: string) => DB };
  const db = new DatabaseSync(path.join(DATA_DIR, "store.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
  const row = db.prepare("SELECT MAX(version) v FROM schema_migrations").get();
  const current = Number(row?.v || 0);
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(i + 1);
      if (i === 0) {
        seedCatalogue(db);
        seedSettings(db);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}

export function db(): DB {
  if (!g.__wxdb) g.__wxdb = open();
  return g.__wxdb;
}

export function tx<T>(fn: (d: DB) => T): T {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try {
    const r = fn(d);
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

/** True when DATA_DIR sits on its own mount (a persistent volume), so data survives redeploys. */
export function storageIsPersistent(): boolean | null {
  try {
    const info = fs.readFileSync("/proc/self/mountinfo", "utf8");
    const dir = path.resolve(DATA_DIR);
    return info.split("\n").some((l) => l.split(" ")[4] === dir);
  } catch {
    return null;
  }
}
