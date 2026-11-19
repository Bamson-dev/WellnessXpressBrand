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
  `ALTER TABLE variants ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 0;
   CREATE TABLE IF NOT EXISTS inventory_movements (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     product_id INTEGER NOT NULL,
     variant_id INTEGER NOT NULL,
     product_name TEXT NOT NULL,
     variant_label TEXT NOT NULL,
     sku TEXT NOT NULL,
     previous_qty INTEGER NOT NULL,
     new_qty INTEGER NOT NULL,
     qty_change INTEGER NOT NULL,
     reason TEXT NOT NULL,
     actor TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant ON inventory_movements(variant_id, id DESC);
   CREATE INDEX IF NOT EXISTS idx_inventory_movements_created ON inventory_movements(created_at DESC);`,
  `ALTER TABLE order_items ADD COLUMN stock_tracked_at_payment INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE order_items ADD COLUMN stock_deducted INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE delivery_zones ADD COLUMN estimated_delivery TEXT NOT NULL DEFAULT '';
   ALTER TABLE orders ADD COLUMN delivery_estimate TEXT NOT NULL DEFAULT '';`,
  `INSERT OR IGNORE INTO delivery_zones (state,fee,active,note) VALUES
    ('Abia',NULL,1,''),('Adamawa',NULL,1,''),('Akwa Ibom',NULL,1,''),('Anambra',NULL,1,''),('Bauchi',NULL,1,''),('Bayelsa',NULL,1,''),
    ('Benue',NULL,1,''),('Borno',NULL,1,''),('Cross River',NULL,1,''),('Delta',NULL,1,''),('Ebonyi',NULL,1,''),('Edo',NULL,1,''),
    ('Ekiti',NULL,1,''),('Enugu',NULL,1,''),('FCT (Abuja)',NULL,1,''),('Gombe',NULL,1,''),('Imo',NULL,1,''),('Jigawa',NULL,1,''),
    ('Kaduna',NULL,1,''),('Kano',NULL,1,''),('Katsina',NULL,1,''),('Kebbi',NULL,1,''),('Kogi',NULL,1,''),('Kwara',NULL,1,''),
    ('Lagos',NULL,1,''),('Nasarawa',NULL,1,''),('Niger',NULL,1,''),('Ogun',NULL,1,''),('Ondo',NULL,1,''),('Osun',NULL,1,''),
    ('Oyo',NULL,1,''),('Plateau',NULL,1,''),('Rivers',NULL,1,''),('Sokoto',NULL,1,''),('Taraba',NULL,1,''),('Yobe',NULL,1,''),('Zamfara',NULL,1,'');`,
  `CREATE TABLE IF NOT EXISTS delivery_zone_history (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     state TEXT NOT NULL,
     previous_config TEXT NOT NULL,
     new_config TEXT NOT NULL,
     actor TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS idx_delivery_zone_history_created ON delivery_zone_history(id DESC);`,
  `CREATE TABLE IF NOT EXISTS product_media (
     product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
     src TEXT NOT NULL,
     alt_text TEXT NOT NULL DEFAULT '',
     caption TEXT NOT NULL DEFAULT '',
     sort INTEGER NOT NULL DEFAULT 0,
     updated_at TEXT NOT NULL DEFAULT (datetime('now')),
     PRIMARY KEY(product_id,src)
   );
   CREATE INDEX IF NOT EXISTS idx_product_media_product_sort ON product_media(product_id,sort);`,
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
