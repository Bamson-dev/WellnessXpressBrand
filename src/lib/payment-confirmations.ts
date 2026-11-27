import "server-only";
import { db, type DB } from "@/lib/db";

/*
 * Payment confirmation form submissions (customers who already paid). Rows start as awaiting_verification and become
 * paid only when an admin marks them so after checking the bank account. The table is created here, once per process,
 * with CREATE TABLE IF NOT EXISTS, so the existing order tables and migrations are untouched.
 */
let ready = false;
export function confirmationsDb(): DB {
  const d = db();
  if (!ready) {
    d.exec(`CREATE TABLE IF NOT EXISTS payment_confirmations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      amount_paid INTEGER NOT NULL,
      address TEXT NOT NULL,
      state TEXT NOT NULL,
      receipt_path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'awaiting_verification',
      verified_amount INTEGER,
      verified_by TEXT NOT NULL DEFAULT '',
      paid_at TEXT,
      admin_note TEXT NOT NULL DEFAULT '',
      tracking TEXT NOT NULL DEFAULT '{}',
      purchase_event_id TEXT NOT NULL DEFAULT '',
      purchase_event_status TEXT NOT NULL DEFAULT '',
      submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payment_confirmations_status ON payment_confirmations(status, id DESC);`);
    // Added later: hash of the uploaded receipt bytes, used to reject exact duplicate submissions.
    // Non-destructive: existing rows keep the empty default and are never deleted or rewritten.
    try { d.exec("ALTER TABLE payment_confirmations ADD COLUMN receipt_hash TEXT NOT NULL DEFAULT ''"); } catch { /* column already exists */ }
    try { d.exec("CREATE INDEX IF NOT EXISTS idx_payment_confirmations_receipt_hash ON payment_confirmations(receipt_hash)"); } catch { /* index already exists */ }
    // Added later: the order this submission claims to pay for, and the TikTok Purchase status kept
    // separate from the Meta status. Same non-destructive pattern; existing rows keep empty defaults.
    try { d.exec("ALTER TABLE payment_confirmations ADD COLUMN order_number TEXT NOT NULL DEFAULT ''"); } catch { /* column already exists */ }
    try { d.exec("ALTER TABLE payment_confirmations ADD COLUMN tiktok_event_status TEXT NOT NULL DEFAULT ''"); } catch { /* column already exists */ }
    try { d.exec("CREATE INDEX IF NOT EXISTS idx_payment_confirmations_order ON payment_confirmations(order_number)"); } catch { /* index already exists */ }
    ready = true;
  }
  return d;
}
