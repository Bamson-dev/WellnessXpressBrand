"use client";
import { useState, type FormEvent } from "react";
import { NIGERIAN_STATES } from "@/lib/site";

export default function ConfirmPaymentDetailsForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "busy" | "done" | "fail">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const local: Record<string, string> = {};
    const file = fd.get("receipt");
    if (!file || typeof file === "string" || file.size === 0) local.receipt = "Upload your payment receipt.";
    else if (file.size > 5 * 1024 * 1024) local.receipt = "The receipt must be 5 MB or smaller.";
    if (Object.keys(local).length) { setErrors(local); return; }
    setState("busy"); setErrors({}); setMsg("");
    try {
      const r = await fetch("/api/confirm-payment", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setState("done"); form.reset(); window.scrollTo({ top: 0 }); return; }
      if (j.errors) setErrors(j.errors);
      setMsg(j.error || "Check the highlighted fields.");
    } catch {
      setMsg("We could not reach the server. Try again, or send your details on WhatsApp.");
    }
    setState("fail");
  }

  if (state === "done")
    return (
      <div role="status" className="card p-6">
        <h2 className="text-2xl">PAYMENT DETAILS RECEIVED</h2>
        <p className="mt-3 text-neutral-700">Thank you for submitting your payment and delivery details.</p>
        <p className="mt-2 text-neutral-700">Our team will verify your payment and process your order. We will contact you through WhatsApp if we need any additional information.</p>
      </div>
    );

  const input = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} name={id} className="field" required aria-invalid={!!errors[id]} aria-describedby={errors[id] ? id + "-e" : undefined} {...props} />
      {errors[id] && <p id={id + "-e"} className="err">{errors[id]}</p>}
    </div>
  );
  return (
    <form onSubmit={submit} className="card space-y-5 p-5 sm:p-6" noValidate>
      <div>
        {input("orderReference", "Order number", { autoComplete: "off", maxLength: 20, placeholder: "e.g. WX251126-ABCDE", style: { textTransform: "uppercase" } })}
        <p className="mt-1 text-xs text-neutral-500">Your order number is shown on your order page and in your order confirmation. The amount and phone number below must match that order.</p>
      </div>
      {input("fullName", "Full name", { autoComplete: "name", maxLength: 100 })}
      {input("phone", "WhatsApp phone number", { type: "tel", inputMode: "tel", autoComplete: "tel", maxLength: 16 })}
      {input("amount", "Amount paid (₦)", { inputMode: "numeric", defaultValue: "30000" })}
      <div>
        <label htmlFor="address" className="label">Delivery address</label>
        <textarea id="address" name="address" rows={3} className="field" required maxLength={400} autoComplete="street-address" aria-invalid={!!errors.address} />
        {errors.address && <p className="err">{errors.address}</p>}
      </div>
      <div>
        <label htmlFor="stateSel" className="label">State</label>
        <select id="stateSel" name="state" className="field" required defaultValue="" aria-invalid={!!errors.state}>
          <option value="" disabled>Select your state</option>
          {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {errors.state && <p className="err">{errors.state}</p>}
      </div>
      <div>
        <label htmlFor="receipt" className="label">Payment receipt (JPG, PNG or PDF, up to 5 MB)</label>
        <input id="receipt" name="receipt" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" className="field" required aria-invalid={!!errors.receipt} />
        {errors.receipt && <p className="err">{errors.receipt}</p>}
      </div>
      <div className="hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {state === "fail" && msg ? <p className="err" role="alert">{msg}</p> : null}
      <button className="btn btn-primary w-full text-base" disabled={state === "busy"}>{state === "busy" ? "Sending..." : "SUBMIT DETAILS"}</button>
    </form>
  );
}
