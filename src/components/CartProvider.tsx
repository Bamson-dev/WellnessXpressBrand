"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { track } from "@/components/pixel";

export type CartLine = { variantId: number; qty: number; slug: string; name: string; label: string; price: number; image: string | null };
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
      if (raw) setLines((JSON.parse(raw) as CartLine[]).filter((l) => Number.isInteger(l.variantId) && l.qty > 0));
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
    track("AddToCart", { currency: "NGN", value: l.price * qty, content_ids: [String(l.variantId)], content_type: "product" });
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
