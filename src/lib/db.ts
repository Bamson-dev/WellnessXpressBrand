import "server-only";
import path from "path";
import fs from "fs";
import { seedCatalogue, seedSettings } from "@/lib/seed";
import { NIGERIAN_STATES } from "@/lib/site";

/* node:sqlite is built into Node 22. We load it through the real Node require so webpack does not try to bundle it. */
declare const __non_webpack_require__: NodeRequire;
type Stmt = {
  run: (...p: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
  get: (...p: unknown[]) => Record<string, unknown> | undefined;
  all: (...p: unknown[]) => Record<string, unknown>[];
};
export type DB = { exec: (sql: string) => void; prepare: (sql: string) => Stmt; close: () => void };

/** Adds images already used by products/categories to the library so they get alt text and reference protection. */
function registerExistingImages(d: DB) {
  const urls = new Set<string>();
  for (const r of d.prepare("SELECT images FROM products").all()) {
    try { (JSON.parse(String(r.images)) as string[]).forEach((u) => urls.add(u)); } catch {}
  }
  for (const r of d.prepare("SELECT image FROM categories WHERE image != ''").all()) urls.add(String(r.image));
  const ins = d.prepare("INSERT OR IGNORE INTO media (url, file, builtin, original_name) VALUES (?,?,?,?)");
  for (const u of urls) {
    const m = /^\/media\/([a-f0-9]{24}\.(?:jpg|png|webp))$/.exec(u);
    ins.run(u, m ? "media/" + m[1] : "", m ? 0 : 1, u.split("/").pop() || "");
  }
}

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");
export const RECEIPT_DIR = path.join(DATA_DIR, "receipts");
export const PRODUCT_IMG_DIR = path.join(DATA_DIR, "product-images");

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
  `ALTER TABLE orders ADD COLUMN delivery_payment_status TEXT NOT NULL DEFAULT 'not_set';
   ALTER TABLE orders ADD COLUMN delivery_paid_at TEXT;
   ALTER TABLE orders ADD COLUMN delivery_payment_reference TEXT NOT NULL DEFAULT '';
   UPDATE orders SET delivery_payment_status = CASE
     WHEN delivery_fee IS NULL THEN 'not_set'
     WHEN payment_status = 'paid' THEN 'paid'
     ELSE 'pending'
   END;
   UPDATE orders SET delivery_paid_at = paid_at, delivery_payment_reference = payment_reference
     WHERE delivery_payment_status = 'paid';`,
  `UPDATE products SET ingredients = '' WHERE slug IN ('tummy-balance','appetite-suppressant');
   UPDATE variants SET label = 'Unspecified option', size = '', duration = ''
     WHERE sku = 'WX-TRIM-DOWN-COFFEE-SMALL';
   UPDATE products SET review_note = 'Two prices supplied: 1 Month ₦12,500 and an additional ₦10,000 price entry. The size or duration for the ₦10,000 entry was not supplied; confirm before relabelling it.'
     WHERE slug = 'trim-down-coffee';`,
  `UPDATE settings SET value = json_quote('We deliver to addresses in Nigeria.\n\nYou can pay for your products when you place your order. The delivery fee is confirmed separately afterward, and must be paid as a separate amount before dispatch.\n\nWe start processing your order after we confirm your product payment and delivery payment.')
     WHERE key = 'shippingPolicy' AND value = json_quote('We deliver to addresses in Nigeria.\n\nThe delivery fee depends on your state. If we have set a fee for your state, you see it at checkout and it is included in your total.\n\nIf we have not set a fee for your state yet, you can still place your order. We will confirm the delivery fee with you by phone or WhatsApp, and your order page will then show the final amount to pay. Do not transfer money until you see the final amount.\n\nWe start processing your order after we confirm your payment.');
   UPDATE settings SET value = json_quote('All prices are in Nigerian Naira (₦).\n\nPayment is by bank transfer to the account shown after checkout. Product payment and delivery payment are collected separately. Your order advances only after an admin verifies the relevant payment in the bank account. Uploading a receipt or entering a transfer reference does not confirm payment by itself.\n\nProduct availability can change. If an item you ordered is not available, we will contact you before processing your order.')
     WHERE key = 'termsPolicy' AND value = json_quote('All prices are in Nigerian Naira (₦).\n\nPayment is by bank transfer to the account shown at checkout. Your order is confirmed only after we verify your payment in our bank account. Uploading a receipt or entering a transfer reference does not confirm payment by itself.\n\nTransfer the exact amount shown on your order page. If the delivery fee for your state has not been set, wait until your order page shows the final amount before you pay.\n\nProduct availability can change. If an item you ordered is not available, we will contact you before processing your order.');`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    seo_title TEXT NOT NULL DEFAULT '',
    meta_description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS category_redirects (
    old_slug TEXT PRIMARY KEY,
    new_slug TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO categories (slug,name,description,image,sort) VALUES
    ('individual','Individual Products','Each WellnessXpress product on its own.','/images/categories/category-individual.webp',0),
    ('combos','Combo Sets','WellnessXpress products packed together as a set.','/images/categories/category-combos.webp',1);`,
  // v6: state delivery settings (all 36 states + FCT), order delivery snapshot, checkout idempotency.
  // States without an admin-entered fee stay unavailable. No fee is invented.
  `ALTER TABLE delivery_zones ADD COLUMN eta TEXT NOT NULL DEFAULT '';
   ALTER TABLE delivery_zones ADD COLUMN updated_at TEXT;
   UPDATE delivery_zones SET active = 0 WHERE fee IS NULL;
   ALTER TABLE orders ADD COLUMN delivery_eta TEXT NOT NULL DEFAULT '';
   ALTER TABLE orders ADD COLUMN delivery_fee_source TEXT NOT NULL DEFAULT '';
   ALTER TABLE orders ADD COLUMN client_key TEXT NOT NULL DEFAULT '';
   CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_key ON orders(client_key) WHERE client_key != '';
   UPDATE orders SET delivery_fee_source = 'admin' WHERE delivery_fee IS NOT NULL AND delivery_fee_source = '';`,
  // v7: inventory movement history and low-stock thresholds. Existing stock values are kept as they are.
  `CREATE TABLE IF NOT EXISTS stock_movements (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     variant_id INTEGER NOT NULL,
     order_id INTEGER,
     delta INTEGER NOT NULL,
     stock_after INTEGER,
     reason TEXT NOT NULL,
     note TEXT NOT NULL DEFAULT '',
     actor TEXT NOT NULL DEFAULT '',
     at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS idx_stock_mov_variant ON stock_movements(variant_id, id);
   CREATE INDEX IF NOT EXISTS idx_stock_mov_order ON stock_movements(order_id);
   ALTER TABLE variants ADD COLUMN low_stock_threshold INTEGER;`,
  // v8: central media library. Files live in DATA_DIR/product-images (persistent volume).
  `CREATE TABLE IF NOT EXISTS media (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     url TEXT NOT NULL UNIQUE,
     file TEXT NOT NULL DEFAULT '',
     original_name TEXT NOT NULL DEFAULT '',
     mime TEXT NOT NULL DEFAULT '',
     bytes INTEGER NOT NULL DEFAULT 0,
     alt TEXT NOT NULL DEFAULT '',
     caption TEXT NOT NULL DEFAULT '',
     builtin INTEGER NOT NULL DEFAULT 0,
     uploaded_by TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`,
];

function open(): DB {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  fs.mkdirSync(RECEIPT_DIR, { recursive: true });
  fs.mkdirSync(PRODUCT_IMG_DIR, { recursive: true });
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
      if (i === 7) registerExistingImages(db);
      if (i === 5) {
        const ins = db.prepare("INSERT OR IGNORE INTO delivery_zones (state, fee, active, note, eta) VALUES (?, NULL, 0, '', '')");
        for (const st of NIGERIAN_STATES) ins.run(st);
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
