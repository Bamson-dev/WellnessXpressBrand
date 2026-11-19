"use client";
import { useState } from "react";

export default function ReviewForm({ product }: { product: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        product, orderNumber: form.get("orderNumber"), phone: form.get("phone"), rating: form.get("rating"), review: form.get("review"),
      }) });
      const result = await response.json();
      setMessage(result.message || result.error || "Could not submit your review.");
      if (response.ok) (document.getElementById(`review-${product}`) as HTMLFormElement | null)?.reset();
    } catch { setMessage("Could not submit your review. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <form id={`review-${product}`} action={submit} className="mt-5 grid gap-3 sm:grid-cols-2">
    <label className="text-sm">Order number<input required name="orderNumber" autoComplete="off" className="mt-1 w-full rounded-lg border p-3" /></label>
    <label className="text-sm">Phone used for order<input required name="phone" inputMode="tel" autoComplete="tel" className="mt-1 w-full rounded-lg border p-3" /></label>
    <label className="text-sm">Rating<select required name="rating" defaultValue="5" className="mt-1 w-full rounded-lg border p-3"><option value="5">5 stars</option><option value="4">4 stars</option><option value="3">3 stars</option><option value="2">2 stars</option><option value="1">1 star</option></select></label>
    <label className="text-sm sm:col-span-2">Your review<textarea required name="review" minLength={10} maxLength={1200} rows={4} className="mt-1 w-full rounded-lg border p-3" /></label>
    <button disabled={busy} className="btn btn-primary w-fit disabled:opacity-60">{busy ? "Submitting…" : "Submit verified review"}</button>
    <p role="status" aria-live="polite" className="self-center text-sm text-neutral-600">{message}</p>
    <p className="text-xs text-neutral-500 sm:col-span-2">Only paid orders are eligible. Your review is checked before it appears publicly.</p>
  </form>;
}
