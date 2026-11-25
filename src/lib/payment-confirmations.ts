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
    ready = true;
  }
  return d;
}
