"use client";

import { useRef, useState } from "react";

type Props = { productId: number; index: number; returnPath: string };

export default function ReplaceImageUpload({ productId, index, returnPath }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = ref.current?.files?.[0];
    if (!file) {
      setError(true);
      setMessage("Choose the replacement image first.");
      return;
    }
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const data = new FormData();
      data.set("productId", String(productId));
      data.set("index", String(index));
      data.set("image", file);
      const response = await fetch("/api/admin/products/replace-image", {
        method: "POST",
        body: data,
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Upload failed (${response.status}).`);
      window.location.assign(returnPath + (returnPath.includes("?") ? "&" : "?") + "msg=" + encodeURIComponent(result.message || "Image replaced."));
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "Image replacement failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1 text-xs">
      <input ref={ref} type="file" name="image" accept="image/jpeg,image/png,image/webp" className="w-full min-w-0 max-w-[180px] text-xs" aria-label="Replacement image" required disabled={busy} />
      <button type="submit" disabled={busy} className="text-brand-700 underline disabled:opacity-50">{busy ? "Replacing…" : "Replace"}</button>
      {message ? <p role="status" className={error ? "w-full text-red-700" : "w-full text-green-700"}>{message}</p> : null}
    </form>
  );
}
