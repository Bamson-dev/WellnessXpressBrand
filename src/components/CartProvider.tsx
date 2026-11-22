"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { track } from "@/components/pixel";

export type CartLine = { variantId: number; qty: number; slug: string; name: string; label: string; price: number; image: string | null; sku?: string };
/** Meta content id for a cart line: the SKU, the same id ViewContent and the server Purchase event use. */
export const contentId = (l: { sku?: string; variantId: number }) => l.sku || String(l.variantId);
type Ctx = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  ready: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (l: Omit<CartLine, "qty">, qty?: number) => void;
  setQty: (variantId: number, qty: number) => void;
  remove: (variantId: number) => void;
  clear: () => void;
  replacePrices: (prices: Record<number, number>) => void;
};
const CartCtx = createContext<Ctx | null>(null);
const KEY = "wx_cart_v2";
export const MAX_QTY = 20;

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cleanLines = parsed.flatMap((item): CartLine[] => {
            if (!item || typeof item !== "object") return [];
            const l = item as Partial<CartLine>;
            if (!Number.isSafeInteger(l.variantId) || Number(l.variantId) <= 0 || !Number.isFinite(Number(l.qty)) || Number(l.qty) <= 0) return [];
            const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(l.qty))));
            const slug = typeof l.slug === "string" ? l.slug.slice(0, 160) : "";
            const name = typeof l.name === "string" ? l.name.slice(0, 200) : "";
            const label = typeof l.label === "string" ? l.label.slice(0, 120) : "";
            const price = Number.isFinite(Number(l.price)) && Number(l.price) >= 0 ? Number(l.price) : 0;
            const image = typeof l.image === "string" ? l.image.slice(0, 1000) : null;
            const sku = typeof l.sku === "string" ? l.sku.slice(0, 100) : undefined;
            return [{ variantId: Number(l.variantId), qty, slug, name, label, price, image, sku }];
          });
          setLines(cleanLines);
        }
      }
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch {}
  }, [lines, ready]);

  const add = useCallback((l: Omit<CartLine, "qty">, qty = 1) => {
    setLines((prev) => {
      const ex = prev.find((p) => p.variantId === l.variantId);
      if (ex) return prev.map((p) => (p.variantId === l.variantId ? { ...p, ...l, qty: Math.min(MAX_QTY, p.qty + qty) } : p));
      return [...prev, { ...l, qty: Math.min(MAX_QTY, qty) }];
    });
    track("AddToCart", { currency: "NGN", value: l.price * qty, content_ids: [contentId(l)], content_type: "product" });
    setOpen(true);
  }, []);
  const setQty = useCallback((id: number, qty: number) => {
    setLines((prev) => (qty < 1 ? prev.filter((p) => p.variantId !== id) : prev.map((p) => (p.variantId === id ? { ...p, qty: Math.min(MAX_QTY, qty) } : p))));
  }, []);
  const remove = useCallback((id: number) => setLines((prev) => prev.filter((p) => p.variantId !== id)), []);
  const clear = useCallback(() => setLines([]), []);
  const replacePrices = useCallback((prices: Record<number, number>) => {
    setLines((prev) => {
      const next = prev.map((p) => (prices[p.variantId] != null && prices[p.variantId] !== p.price ? { ...p, price: prices[p.variantId] } : p));
      return next.some((n, i) => n !== prev[i]) ? next : prev;
    });
  }, []);

  const value = useMemo(
    () => ({
      lines, ready, open, setOpen, add, setQty, remove, clear, replacePrices,
      count: lines.reduce((s, l) => s + l.qty, 0),
      subtotal: lines.reduce((s, l) => s + l.qty * l.price, 0),
    }),
    [lines, ready, open, add, setQty, remove, clear, replacePrices]
  );
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
