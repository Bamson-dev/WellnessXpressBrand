"use client";
import { useState, type FormEvent } from "react";

export default function ContactForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "busy" | "done" | "fail">("idle");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setState("busy"); setErrors({});
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      const r = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (r.ok) { setState("done"); form.reset(); }
      else { if (j.errors) setErrors(j.errors); setState("fail"); }
    } catch { setState("fail"); }
  }
  if (state === "done") return <p role="status" className="card p-6 text-lg">Thank you. We received your message and will reply soon.</p>;
  const f = (id: string, label: string, type = "text", auto = "") => (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} name={id} type={type} autoComplete={auto} className="field" aria-invalid={!!errors[id]} aria-describedby={errors[id] ? id + "-e" : undefined} />
      {errors[id] && <p id={id + "-e"} className="err">{errors[id]}</p>}
    </div>
  );
  return (
    <form onSubmit={submit} className="card space-y-5 p-5 sm:p-6" noValidate>
      {f("name", "Your name", "text", "name")}{f("phone", "Phone number", "tel", "tel")}{f("email", "Email (optional)", "email", "email")}
      <div className="hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div>
        <label htmlFor="message" className="label">Message</label>
        <textarea id="message" name="message" rows={5} className="field" aria-invalid={!!errors.message} />
        {errors.message && <p className="err">{errors.message}</p>}
      </div>
      {state === "fail" && !Object.keys(errors).length && <p className="err" role="alert">Could not send your message. Try again, or message us on WhatsApp.</p>}
      <button className="btn btn-primary w-full sm:w-auto" disabled={state === "busy"}>{state === "busy" ? "Sending..." : "Send message"}</button>
    </form>
  );
}
