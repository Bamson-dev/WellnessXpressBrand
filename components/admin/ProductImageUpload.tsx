"use client";

import { useRef, useState } from "react";

type Props = { productId: number };

export default function ProductImageUpload({ productId }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const files = Array.from(input.current?.files || []);
    if (!files.length) {
      setIsError(true);
      setMessage("Choose at least one image.");
      return;
    }
    if (files.length > 4) {
      setIsError(true);
      setMessage("Upload a maximum of 4 images at once.");
      return;
    }
    setBusy(true);
    setMessage("");
    setIsError(false);
    try {
      const data = new FormData();
      data.set("productId", String(productId));
      files.forEach((file) => data.append("images", file));
      const response = await fetch("/api/admin/products/upload-images", {
        method: "POST",
        body: data,
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Upload failed (${response.status}).`);
      window.location.assign(`/admin/products/${productId}?msg=${encodeURIComponent(result.message || "Images uploaded.")}`);
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <input ref={input} type="file" name="images" multiple accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" required disabled={busy} aria-label="Upload photos" />
      <p className="text-xs text-neutral-500">Up to 4 photos at a time. Each photo must be 6 MB or smaller.</p>
      <button type="submit" disabled={busy} className="admin-btn-ghost disabled:opacity-50">{busy ? "Uploading…" : "Upload photos"}</button>
      {message ? <p role="status" className={isError ? "text-sm text-red-700" : "text-sm text-green-700"}>{message}</p> : null}
    </form>
  );
}