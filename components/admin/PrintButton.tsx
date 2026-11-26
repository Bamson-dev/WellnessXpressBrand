"use client";
export default function PrintButton({ label = "Print" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="admin-btn-ghost print:hidden">{label}</button>;
}
