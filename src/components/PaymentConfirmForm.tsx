"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PaymentConfirmForm({ number, token }: { number: string; token: string }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErrors({}); setFail("");
    const fd = new FormData(e.currentTarget);
    fd.set("t", token);
    const file = fd.get("receipt");
    if (file && typeof file !== "string" && file.size > 5 * 1024 * 1024) { setErrors({ receipt: "The receipt must be 5 MB or smaller." }); setBusy(false); return; }
    try {
      const r = await fetch(`/api/orders/${encodeURIComponent(number)}/payment`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { router.refresh(); return; }
      if (j.errors) setErrors(j.errors);
      setFail(j.error || "Check the highlighted fields.");
    } catch {
      setFail("We could not reach the server. Try again, or send your receipt on WhatsApp.");
    }
    setBusy(false);
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn btn-primary mt-5 w-full text-base sm:w-auto">I have paid: send payment confirmation</button>;
  return (
    <form onSubmit={submit} className="mt-5 space-y-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:p-5" noValidate encType="multipart/form-data">
      <h3 className="text-lg">Payment confirmation</h3>
      <div>
        <label htmlFor="payerName" className="label">Name on the account you paid from</label>
        <input id="payerName" name="payerName" className="field" autoComplete="name" aria-invalid={!!errors.payerName} />
        {errors.payerName ? <p className="err">{errors.payerName}</p> : null}
      </div>
      <div>
        <label htmlFor="reference" className="label">Transfer reference or session ID</label>
        <input id="reference" name="reference" className="field" aria-invalid={!!errors.reference} />
        <p className="hint">You find this on your bank app receipt. Enter it, upload your receipt, or both.</p>
        {errors.reference ? <p className="err">{errors.reference}</p> : null}
      </div>
      <div>
        <label htmlFor="receipt" className="label">Upload receipt (optional)</label>
        <input id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full rounded-xl border border-dashed border-neutral-300 bg-white p-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-700 file:px-4 file:py-2 file:font-semibold file:text-white" />
        <p className="hint">JPG, PNG, WebP or PDF. Maximum 5 MB.</p>
        {errors.receipt ? <p className="err">{errors.receipt}</p> : null}
      </div>
      <div>
        <label htmlFor="note" className="label">Note (optional)</label>
        <input id="note" name="note" className="field" placeholder="For example: paid from my OPay account" />
      </div>
      {fail ? <p className="err" role="alert">{fail}</p> : null}
      <button className="btn btn-primary w-full text-base sm:w-auto" disabled={busy}>{busy ? "Sending..." : "Submit payment confirmation"}</button>
      <p className="text-sm text-neutral-500">Submitting this does not mark your order as paid. We confirm the payment in our bank account first.</p>
    </form>
  );
}
