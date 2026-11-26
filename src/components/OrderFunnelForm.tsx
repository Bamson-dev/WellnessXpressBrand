"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { NIGERIAN_STATES } from "@/lib/site";

const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "ttclid", "fbp", "fbc", "ttp"];

/** First-party browser cookies set by the Meta / TikTok pixels, used when the URL carries no IDs. */
const COOKIE_FALLBACK: [string, string][] = [["fbp", "_fbp"], ["fbc", "_fbc"], ["ttp", "_ttp"]];
function readCookie(cookieName: string) {
  const m = new RegExp("(?:^|;\\s*)" + cookieName + "=([^;]+)").exec(document.cookie || "");
  return m ? decodeURIComponent(m[1]) : "";
}

export default function OrderFunnelForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const key = useRef("");
  useEffect(() => { key.current = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/[^A-Za-z0-9_-]/g, "").padEnd(16, "x").slice(0, 40); }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(fd.entries());
    const local: Record<string, string> = {};
    if (String(body.name || "").trim().length < 2) local.name = "Enter your full name.";
    if (!/^(\+?234|0)?[789][01]\d{8}$/.test(String(body.phone || "").replace(/[\s-]/g, ""))) local.phone = "Enter a valid Nigerian WhatsApp number, for example 0803 123 4567.";
    if (!body.state) local.state = "Choose your state.";
    if (String(body.address || "").trim().length < 8) local.address = "Enter your full delivery address.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true); setMsg("");
    const q = new URLSearchParams(location.search);
    const attr: Record<string, string> = {};
    for (const k of KEYS) { const v = q.get(k); if (v) attr[k] = v; }
    // Fallback: if the URL carries no pixel IDs (e.g. after the cross-domain hop from the landing page),
    // use the first-party cookies the pixels set on this domain. Never overwrite a URL value with a cookie.
    for (const [attrKey, cookieName] of COOKIE_FALLBACK) {
      if (!attr[attrKey]) { const v = readCookie(cookieName); if (v) attr[attrKey] = v; }
    }
    // If we have the click id but no fbc, build fbc in Meta's format: fb.1.<timestamp>.<fbclid>
    if (!attr.fbc && attr.fbclid) attr.fbc = `fb.1.${Date.now()}.${attr.fbclid}`;
    try {
      const r = await fetch("/api/funnel/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, clientKey: key.current, attr: Object.keys(attr).length ? attr : undefined }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.number) { location.href = `/order/${encodeURIComponent(j.number)}?t=${encodeURIComponent(j.token)}&new=1`; return; }
      if (j.errors) setErrors(j.errors);
      setMsg(j.error || "Check the highlighted fields.");
    } catch { setMsg("We could not reach the server. Try again, or message us on WhatsApp."); }
    setBusy(false);
  }

  const err = (k: string) => (errors[k] ? <p className="err">{errors[k]}</p> : null);
  return (
    <form onSubmit={submit} className="card space-y-5 p-5 sm:p-6" noValidate>
      <div><label htmlFor="name" className="label">Full name</label><input id="name" name="name" className="field" autoComplete="name" maxLength={100} aria-invalid={!!errors.name} />{err("name")}</div>
      <div><label htmlFor="phone" className="label">WhatsApp phone number</label><input id="phone" name="phone" type="tel" inputMode="tel" className="field" autoComplete="tel" maxLength={20} aria-invalid={!!errors.phone} />{err("phone")}</div>
      <div><label htmlFor="state" className="label">State</label>
        <select id="state" name="state" className="field" defaultValue="" aria-invalid={!!errors.state}><option value="" disabled>Select your state</option>{NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select>{err("state")}</div>
      <div><label htmlFor="address" className="label">Delivery address</label><textarea id="address" name="address" rows={3} className="field" maxLength={300} autoComplete="street-address" aria-invalid={!!errors.address} />{err("address")}</div>
      <div className="hidden" aria-hidden="true"><label>Company<input name="company" tabIndex={-1} autoComplete="off" /></label></div>
      {msg ? <p className="err" role="alert">{msg}</p> : null}
      <button className="btn btn-primary w-full text-base" disabled={busy}>{busy ? "Placing your order..." : "PLACE MY ORDER"}</button>
      <p className="text-sm text-neutral-500">Placing an order does not take any payment. Your order is only confirmed after you pay by bank transfer and we verify it.</p>
    </form>
  );
}
