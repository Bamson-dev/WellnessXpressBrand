"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CartLine { sku: string; slug: string; name: string; price: number; qty: number }
interface Ctx {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (l: Omit<CartLine, "qty">, qty?: number) => void;
  setQty: (sku: string, qty: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
  ready: boolean;
}
const CartCtx = createContext<Ctx | null>(null);
const KEY = "wx-cart-v1";
const MAX = 20;

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setLines(parsed.filter((l) => l && l.sku && l.qty > 0).slice(0, 50));
      }
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch {}
  }, [lines, ready]);

  const value = useMemo<Ctx>(() => ({
    lines, ready,
    count: lines.reduce((s, l) => s + l.qty, 0),
    subtotal: lines.reduce((s, l) => s + l.qty * l.price, 0),
    add: (l, qty = 1) => setLines((cur) => {
      const found = cur.find((c) => c.sku === l.sku);
      if (found) return cur.map((c) => (c.sku === l.sku ? { ...c, price: l.price, qty: Math.min(MAX, c.qty + qty) } : c));
      return [...cur, { ...l, qty: Math.min(MAX, qty) }];
    }),
    setQty: (sku, qty) => setLines((cur) => cur.map((c) => (c.sku === sku ? { ...c, qty: Math.max(1, Math.min(MAX, Math.floor(qty) || 1)) } : c))),
    remove: (sku) => setLines((cur) => cur.filter((c) => c.sku !== sku)),
    clear: () => setLines([]),
  }), [lines, ready]);

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}
export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}
