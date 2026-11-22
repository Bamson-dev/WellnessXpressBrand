"use client";
import { useEffect, useState } from "react";
import { useCart } from "@/components/CartProvider";

export type QuoteLine = { variantId: number; slug: string; name: string; label: string; image: string | null; unitPrice: number; qty: number; lineTotal: number; available: boolean; reason?: string };
export type DeliveryInfo = { state: string; available: boolean; fee: number | null; baseFee: number | null; eta: string; message: string };
export type Quote = { lines: QuoteLine[]; subtotal: number; deliveryFee: number | null; total: number | null; state: string | null; delivery?: DeliveryInfo | null };

/** Fetches server prices for the cart (and delivery fee for a state). The browser's stored prices are only a preview. */
export function useQuote(state?: string, city?: string) {
  const { lines, ready, replacePrices } = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(lines.map((l) => [l.variantId, l.qty])) + "|" + (state || "") + "|" + (city || "");
  useEffect(() => {
    if (!ready) return;
    if (!lines.length) {
      setQuote({ lines: [], subtotal: 0, deliveryFee: null, total: null, state: null, delivery: null });
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    fetch("/api/cart/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })), state, city }),
      signal: ctl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Quote request failed");
        return r.json() as Promise<Quote>;
      })
      .then((q) => {
        if (ctl.signal.aborted) return;
        setQuote(q);
        replacePrices(Object.fromEntries(q.lines.map((l) => [l.variantId, l.unitPrice])));
        setLoading(false);
      })
      .catch(() => {
        if (ctl.signal.aborted) return;
        setQuote(null);
        setLoading(false);
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);
  return { quote, loading };
}
