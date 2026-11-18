"use client";
import { IconMinus, IconPlus } from "@/components/icons";
import { MAX_QTY } from "@/components/CartProvider";

export default function QtyControl({ value, onChange, small, label = "Quantity", max = MAX_QTY }: { value: number; onChange: (n: number) => void; small?: boolean; label?: string; max?: number }) {
  const s = small ? "h-9 w-9" : "h-12 w-12";
  return (
    <div className="inline-flex items-center rounded-full border border-neutral-300 bg-white" role="group" aria-label={label}>
      <button type="button" className={`${s} grid place-items-center rounded-full text-ink hover:bg-neutral-100 disabled:opacity-40`} onClick={() => onChange(value - 1)} aria-label="Decrease quantity" disabled={!small && value <= 1}>
        <IconMinus className="h-4 w-4" />
      </button>
      <span className={`${small ? "w-7 text-sm" : "w-9 text-base"} text-center font-semibold tabular-nums`} aria-live="polite">{value}</span>
      <button type="button" className={`${s} grid place-items-center rounded-full text-ink hover:bg-neutral-100 disabled:opacity-40`} onClick={() => onChange(Math.min(max, value + 1))} aria-label="Increase quantity" disabled={value >= max}>
        <IconPlus className="h-4 w-4" />
      </button>
    </div>
  );
}
