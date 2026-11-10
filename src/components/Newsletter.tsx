"use client";
import { useState, type FormEvent } from "react";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const r = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const j = await r.json();
      if (!r.ok) { setState("error"); setMsg(j.error || "Something went wrong."); return; }
      setState("done"); setMsg("You are subscribed."); setEmail("");
    } catch { setState("error"); setMsg("Network error. Try again."); }
  }
  return (
    <div className="mx-auto mt-6 max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row" noValidate>
        <label htmlFor="nl-email" className="sr-only">Email address</label>
        <input id="nl-email" type="email" required autoComplete="email" placeholder="Your email address" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
        <button className="btn btn-primary" disabled={state === "loading"}>{state === "loading" ? "Subscribing..." : "Subscribe"}</button>
      </form>
      <p role="status" aria-live="polite" className={`mt-3 text-sm ${state === "error" ? "text-red-700" : "text-sage-700"}`}>{msg}</p>
    </div>
  );
}
