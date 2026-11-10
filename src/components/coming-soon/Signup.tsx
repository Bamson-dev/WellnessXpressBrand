"use client";
import { useId, useState, type FormEvent } from "react";

type State = "idle" | "loading" | "done" | "duplicate" | "error";

export default function Signup() {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");
  const finished = state === "done" || state === "duplicate";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setState("error");
      setMsg("Enter a valid email address.");
      return;
    }
    setState("loading");
    setMsg("");
    try {
      const r = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, company: form.get("company") || "" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setState("error");
        setMsg(j.error || "Something went wrong. Try again.");
        return;
      }
      if (j.duplicate) {
        setState("duplicate");
        setMsg("You are already on the list. We will email you at launch.");
      } else {
        setState("done");
        setMsg("You are on the list. We will email you when we launch.");
      }
      setEmail("");
    } catch {
      setState("error");
      setMsg("Network error. Check your connection and try again.");
    }
  }

  return (
    <form onSubmit={submit} noValidate className={`su ${finished ? "su-done" : ""}`} aria-describedby={`${uid}-s`}>
      {finished ? (
        <div className="su-ok" role="status">
          <svg className="su-check" viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M15 27l8 8 15-17" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p>{msg}</p>
        </div>
      ) : (
        <>
          <div className="su-row">
            <label htmlFor={`${uid}-e`} className="sr-only">Email address</label>
            <input
              id={`${uid}-e`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={state === "error"}
              className="su-input"
            />
            <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="su-hp" />
            <button type="submit" disabled={state === "loading"} className="btn-lime">
              <span>{state === "loading" ? "Sending" : "Notify Me When We Launch"}</span>
              {state === "loading" ? <i className="su-spin" aria-hidden="true" /> : <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </button>
          </div>
          <p id={`${uid}-s`} role="status" aria-live="polite" className={`su-msg ${state === "error" ? "su-bad" : ""}`}>{msg}</p>
        </>
      )}
    </form>
  );
}
