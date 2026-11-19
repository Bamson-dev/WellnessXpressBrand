import "server-only";
import { db } from "@/lib/db";
import { NIGERIAN_STATES } from "@/lib/site";
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

export type DeliveryZone = { state: string; fee: number | null; active: boolean; note: string; eta: string; updatedAt: string | null };

/** All 36 states and FCT, in the official list order. Missing rows are reported as unavailable. */
export function deliveryZones(): DeliveryZone[] {
  const rows = new Map(db().prepare("SELECT * FROM delivery_zones").all().map((r) => [String(r.state), r]));
  return NIGERIAN_STATES.map((st) => {
    const r = rows.get(st);
    return {
      state: st, fee: r?.fee == null ? null : Number(r.fee), active: r ? Number(r.active) === 1 : false,
      note: r ? String(r.note || "") : "", eta: r ? String(r.eta || "") : "", updatedAt: r?.updated_at ? String(r.updated_at) : null,
    };
  });
}

export type DeliveryQuote = { state: string; available: boolean; fee: number | null; eta: string; message: string };

/** Server-side delivery quote. The browser never supplies the fee. */
export function deliveryQuote(state: string): DeliveryQuote {
  if (!NIGERIAN_STATES.includes(state)) return { state, available: false, fee: null, eta: "", message: "Choose your state." };
  const r = db().prepare("SELECT fee, active, eta FROM delivery_zones WHERE state = ?").get(state);
  if (!r || r.fee == null) return { state, available: false, fee: null, eta: "", message: `Delivery to ${state} is not available yet. Message us on WhatsApp and we will help.` };
  if (Number(r.active) !== 1) return { state, available: false, fee: null, eta: "", message: `We are not delivering to ${state} at the moment. Message us on WhatsApp and we will help.` };
  return { state, available: true, fee: Number(r.fee), eta: String(r.eta || ""), message: "" };
}

export function deliveryFeeFor(state: string): number | null {
  const q = deliveryQuote(state);
  return q.available ? q.fee : null;
}
