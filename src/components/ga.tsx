"use client";
import { useEffect } from "react";

/*
 * GA4 ecommerce events. They only send when the Google tag has loaded (GA_MEASUREMENT_ID is set), and they never
 * include names, phone numbers, addresses or emails. "purchase" is sent only for an order the store has marked paid.
 */
type Gtag = (...a: unknown[]) => void;
export type GaItem = { item_id: string; item_name: string; item_variant?: string; item_brand?: string; price: number; quantity: number };

export function gaEvent(name: string, params: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const g = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof g === "function") g("event", name, params);
}

export const gaItem = (l: { sku?: string; variantId: number; name: string; label?: string; price: number; qty: number }): GaItem => ({
  item_id: l.sku || String(l.variantId), item_name: l.name, item_variant: l.label || undefined, item_brand: "WellnessXpress", price: l.price, quantity: l.qty,
});

/** Sends one event after the page settles (the Google tag loads after hydration). */
export function GaView({ event, params }: { event: string; params: Record<string, unknown> }) {
  useEffect(() => {
    const t = setTimeout(() => gaEvent(event, params), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Confirmed purchase: sent once per order number in this browser, and only when the order is paid. */
export function GaPurchase({ transactionId, params }: { transactionId: string; params: Record<string, unknown> }) {
  useEffect(() => {
    const key = `wx_ga_purchase_${transactionId}`;
    try { if (localStorage.getItem(key)) return; } catch { return; }
    const t = setTimeout(() => {
      const g = (window as unknown as { gtag?: Gtag }).gtag;
      if (typeof g !== "function") return;
      g("event", "purchase", { transaction_id: transactionId, ...params });
      try { localStorage.setItem(key, "1"); } catch {}
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);
  return null;
}
