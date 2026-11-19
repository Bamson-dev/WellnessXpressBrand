"use client";
import { useFormState, useFormStatus } from "react-dom";
import { applyDeliveryImportAction, previewDeliveryImportAction } from "@/app/admin/actions";

type Preview = { error?: string; rows?: { state: string; active: boolean; eta: string; note: string; internalNote: string }[]; problems?: string[]; csv?: string } | null;
function Btn({ children, className = "admin-btn" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? "Working..." : children}</button>;
}

export default function DeliveryImport() {
  const [state, action] = useFormState<Preview, FormData>(previewDeliveryImportAction, null);
  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg">Import from CSV</h2>
      <p className="mt-1 text-sm text-neutral-600">Columns: State, Enabled (yes/no), ETA, Note, Internal note. Export first to get a template. You see a preview before anything is saved.</p>
      <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="file" name="file" accept=".csv,text/csv" className="w-full min-w-0 max-w-xs text-sm" aria-label="Delivery CSV file" />
        <Btn className="admin-btn-ghost">Preview import</Btn>
      </form>
      {state?.error ? <p className="err mt-3">{state.error}</p> : null}
      {state?.rows ? (
        <div className="mt-4">
          {state.problems?.length ? (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">Fix these problems, then preview again. Nothing was saved.</p><ul className="mt-1 list-disc pl-5">{state.problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
          ) : null}
          <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="p-2">State</th><th className="p-2">On</th><th className="p-2">Delivery time</th><th className="p-2">Note</th><th className="p-2">Internal note</th></tr></thead>
              <tbody>{state.rows.map((r) => (<tr key={r.state} className="border-t border-neutral-100"><td className="p-2">{r.state}</td><td className="p-2">{r.active ? "Yes" : "No"}</td><td className="p-2">{r.eta}</td><td className="p-2">{r.note}</td><td className="p-2">{r.internalNote}</td></tr>))}</tbody>
            </table>
          </div>
          {!state.problems?.length && state.rows.length ? (
            <form action={applyDeliveryImportAction} className="mt-3">
              <input type="hidden" name="csv" value={state.csv} />
              <Btn>Save these {state.rows.length} states</Btn>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
