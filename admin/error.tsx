"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Admin route error:", error);
  }, [error]);

  return (
    <section className="mx-auto max-w-xl rounded-xl border border-red-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-red-900">Admin page failed to load</h1>
      <p className="mt-2 text-sm text-neutral-700">
        This page encountered an error. Your saved data has not been intentionally changed. Try loading the page again.
      </p>
      {error.digest ? <p className="mt-3 text-xs text-neutral-500">Error reference: {error.digest}</p> : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => reset()} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white">
          Retry
        </button>
        <Link href="/admin" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800">
          Admin dashboard
        </Link>
        <Link href="/admin/login" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800">
          Sign in
        </Link>
      </div>
    </section>
  );
}
