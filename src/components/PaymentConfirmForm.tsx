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
    try {
      const r = await fetch(`/api/orders/${encodeURIComponent(number)}/payment`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { router.refresh(); return; }
      if (j.errors) setErrors(j.errors);
      setFail(j.error || "Check the highlighted fields.");
    } catch {
      setFail("We could not reach the server. Try again, or contact us on WhatsApp.");
    }
    setBusy(false);
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn btn-primary mt-5 w-full text-base sm:w-auto">I have paid: send payment confirmation</button>;
  return (
    <form onSubmit={submit} className="mt-5 space-y-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:p-5" noValidate>
      <h3 className="text-lg">Payment confirmation</h3>
      <div>
        <label htmlFor="payerName" className="label">Name on the account you paid from</label>
        <input id="payerName" name="payerName" className="field" autoComplete="name" aria-invalid={!!errors.payerName} required />
        {errors.payerName ? <p className="err">{errors.payerName}</p> : null}
      </div>
      <div>
        <label htmlFor="receipt" className="label">Payment receipt (JPG, PNG or PDF, up to 5 MB)</label>
        <input id="receipt" name="receipt" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" className="field" aria-invalid={!!errors.receipt} />
        {errors.receipt ? <p className="err">{errors.receipt}</p> : null}
      </div>
      {fail ? <p className="err" role="alert">{fail}</p> : null}
      <button className="btn btn-primary w-full text-base sm:w-auto" disabled={busy}>{busy ? "Sending..." : "Submit payment confirmation"}</button>
      <p className="text-sm text-neutral-500">We will confirm your payment after checking our bank account. Uploading your receipt helps us verify faster.</p>
    </form>
  );
}
