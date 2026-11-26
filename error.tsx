"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("WellnessX application error:", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-neutral-50 px-5 py-16 text-neutral-900">
      <div className="mx-auto max-w-lg rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-green-800">WellnessXpressBrand</p>
        <h1 className="mt-3 text-2xl font-bold">We ran into a problem</h1>
        <p className="mt-3 text-neutral-600">Something interrupted this page. Your order or account data has not been intentionally changed by this error screen.</p>
        {error.digest ? <p className="mt-3 text-xs text-neutral-500">Error reference: {error.digest}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => reset()} className="rounded-lg bg-green-800 px-5 py-3 font-semibold text-white">Try again</button>
          <a href="/" className="rounded-lg border border-neutral-300 px-5 py-3 font-semibold">Go to homepage</a>
        </div>
      </div>
    </main>
  );
}
