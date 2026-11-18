import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/seed";

export type Bank = { bank: string; accountName: string; accountNumber: string };
export type Contact = { whatsapp: string; email: string; instagram: string; facebook: string; tiktok: string };

export function getSetting<T>(key: string): T {
  const r = db().prepare("SELECT value FROM settings WHERE key = ?").get(key);
  if (!r) return DEFAULT_SETTINGS[key] as T;
  try { return JSON.parse(String(r.value)) as T; } catch { return DEFAULT_SETTINGS[key] as T; }
}
export function setSetting(key: string, value: unknown) {
  db().prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
}

export const getBank = () => getSetting<Bank>("bank");
export const getContact = () => getSetting<Contact>("contact");
export const bankIsComplete = (b: Bank) => !!(b.bank && b.accountName && /^\d{10}$/.test(b.accountNumber));

export function waLink(message: string, contact = getContact()) {
  const n = (contact.whatsapp || "").replace(/\D/g, "");
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null;
}

export function deliveryFeeFor(state: string): number | null {
  const r = db().prepare("SELECT fee, active FROM delivery_zones WHERE state = ?").get(state);
  if (!r || Number(r.active) !== 1 || r.fee == null) return null;
  return Number(r.fee);
}
export function deliveryZones() {
  return db().prepare("SELECT * FROM delivery_zones").all().map((r) => ({ state: String(r.state), fee: r.fee == null ? null : Number(r.fee), active: Number(r.active) === 1, note: String(r.note) }));
}
