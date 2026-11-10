"use client";
import { useState, type FormEvent } from "react";

type State = "idle" | "loading" | "done" | "duplicate" | "error";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");

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
    <form onSubmit={submit} noValidate className="cs-form" aria-describedby="cs-status">
      <div className="cs-row">
        <label htmlFor="cs-email" className="sr-only">Email address</label>
        <input
          id="cs-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={state === "error"}
          className="cs-input"
        />
        <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="cs-hp" />
        <button type="submit" disabled={state === "loading"} className="cs-btn">
          {state === "loading" ? "Sending..." : "Notify Me When We Launch"}
        </button>
      </div>
      <p id="cs-status" role="status" aria-live="polite" className={`cs-status ${state === "error" ? "cs-bad" : "cs-ok"}`}>{msg}</p>
    </form>
  );
}
