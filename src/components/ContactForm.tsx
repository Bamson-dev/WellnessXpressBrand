"use client";
import { useState, type FormEvent } from "react";

export default function ContactForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "busy" | "done" | "fail">("idle");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("busy"); setErrors({});
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const r = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (r.ok) { setState("done"); (e.target as HTMLFormElement).reset(); }
      else { if (j.errors) setErrors(j.errors); setState("fail"); }
    } catch { setState("fail"); }
  }
  if (state === "done") return <p role="status" className="rounded-2xl bg-sage-50 p-6">Thank you. Your message was sent and the team will reply.</p>;
  const f = (id: string, label: string, type = "text") => (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} name={id} type={type} className="field" aria-invalid={!!errors[id]} />
      {errors[id] && <p className="err">{errors[id]}</p>}
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl bg-white p-6" noValidate>
      {f("name", "Your name")}{f("email", "Email", "email")}{f("phone", "Phone (optional)", "tel")}
      <div className="hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div>
        <label htmlFor="message" className="label">Message</label>
        <textarea id="message" name="message" rows={5} className="field" aria-invalid={!!errors.message} />
        {errors.message && <p className="err">{errors.message}</p>}
      </div>
      {state === "fail" && !Object.keys(errors).length && <p className="err" role="alert">Could not send your message. Try again later.</p>}
      <button className="btn btn-primary" disabled={state === "busy"}>{state === "busy" ? "Sending..." : "Send message"}</button>
    </form>
  );
}
