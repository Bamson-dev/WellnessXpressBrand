import type { ReactNode } from "react";
export default function PolicyPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="container-x max-w-3xl py-12 prose-page">
      <h1 className="text-4xl">{title}</h1>
      <p className="mt-4 rounded-xl bg-clay-400/15 p-4 text-sm">Draft policy. Items marked [CONFIRM] need the business owner to confirm before this page is final. Have a qualified adviser review it before relying on it.</p>
      {children}
    </div>
  );
}
