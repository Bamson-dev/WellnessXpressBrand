"use client";
import { useState } from "react";
import { IconCheck, IconCopy } from "@/components/icons";

export default function CopyButton({ text, label, small }: { text: string; label: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement("textarea");
      t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch {}
      t.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }
  return small ? (
    <button type="button" onClick={copy} aria-label={label} className="grid h-9 w-9 place-items-center rounded-full text-brand-700 hover:bg-brand-50">
      {done ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
      <span className="sr-only" aria-live="polite">{done ? "Copied" : ""}</span>
    </button>
  ) : (
    <button type="button" onClick={copy} className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-semibold ${done ? "bg-brand-700 text-white" : "bg-ink text-white hover:bg-black"}`}>
      {done ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}{done ? "Copied" : "Copy"}
      <span className="sr-only">{label}</span>
    </button>
  );
}
