import "server-only";
import { db } from "@/lib/db";
import { NIGERIAN_STATES } from "@/lib/site";
import { DEFAULT_SETTINGS } from "@/lib/seed";
import { getStateDeliveryFee, getLagosDelivery, getOfficePickupFee } from "@/lib/delivery-rates";

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

export type DeliveryZone = { state: string; fee: number | null; active: boolean; note: string; eta: string; internalNote: string; updatedAt: string | null };

/** All 36 states and FCT, in the official list order. Missing rows are reported as unavailable. */
export function deliveryZones(): DeliveryZone[] {
  const rows = new Map(db().prepare("SELECT * FROM delivery_zones").all().map((r) => [String(r.state), r]));
  return NIGERIAN_STATES.map((st) => {
    const r = rows.get(st);
    return {
      state: st, fee: r?.fee == null ? null : Number(r.fee), active: r ? Number(r.active) === 1 : false,
      note: r ? String(r.note || "") : "", eta: r ? String(r.eta || "") : "", internalNote: r ? String(r.internal_note || "") : "", updatedAt: r?.updated_at ? String(r.updated_at) : null,
    };
  });
}

export type DeliveryQuote = { state: string; available: boolean; free: boolean; fee: number | null; baseFee: number | null; eta: string; note: string; message: string };

/** Free delivery threshold is based on the discounted product subtotal. */
export const FREE_DELIVERY_THRESHOLD = 50_000;

/** Delivery fees are server-side. No fee is trusted from the browser. */
export function deliveryQuote(state: string, discountedSubtotal = 0, city = ""): DeliveryQuote {
  const none = { state, available: false, free: false, fee: null, baseFee: null, eta: "", note: "" };
  if (state === "Office Pickup") {\n    const pickupFee = getOfficePickupFee(city);\n    if (pickupFee == null) return { ...none, message: "Select a valid office pickup destination." };\n    return { state, available: true, free: false, fee: pickupFee, baseFee: pickupFee, eta: "3–7 working days", note: "0–4 kg. Extra charges may apply for final weight or bulky parcels.", message: "" };\n  }\n  if (!NIGERIAN_STATES.includes(state)) return { ...none, message: "Choose your state. We deliver within Nigeria only." };
  const r = db().prepare("SELECT active, fee, eta, note FROM delivery_zones WHERE state = ?").get(state);
  const areaRate = state === "Lagos" ? getLagosDelivery(city) : null;
  const configuredRate = state === "Lagos" ? areaRate?.fee ?? null : getStateDeliveryFee(state);
  const rateOverride = configuredRate != null;
  if (r && Number(r.active) !== 1 && !rateOverride) return { ...none, message: `We are not delivering to ${state} at the moment. Message us on WhatsApp and we will help.` };
  if (state === "Lagos" && !areaRate) return { ...none, message: "Select a valid Lagos delivery area to calculate the delivery fee." };
  const feeConfigured = configuredRate != null || r?.fee != null;
  if (discountedSubtotal < FREE_DELIVERY_THRESHOLD && !feeConfigured) return { ...none, message: `Delivery fee for ${state} has not been configured yet. Contact us on WhatsApp.` };
  const baseFee = configuredRate != null ? configuredRate : r?.fee == null ? null : Number(r.fee);
  const fee = discountedSubtotal >= FREE_DELIVERY_THRESHOLD ? 0 : baseFee;
  return { state, available: fee != null, free: fee === 0, fee, baseFee, eta: areaRate?.eta || (r ? String(r.eta || "") : ""), note: areaRate?.note || (r ? String(r.note || "") : ""), message: fee == null ? `Delivery fee for ${state} has not been configured yet. Contact us on WhatsApp.` : "" };
}

export function deliveryFeeFor(state: string): number | null {
  const q = deliveryQuote(state);
  return q.available ? q.fee : null;
}
