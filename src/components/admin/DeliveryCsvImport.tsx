"use client";

import { useMemo, useState } from "react";
import { parseDeliveryCsv } from "@/lib/delivery-csv";
import { importDeliveryCsvAction } from "@/app/admin/actions";

export default function DeliveryCsvImport() {
  const [csv, setCsv] = useState("");
  const [name, setName] = useState("");
  const [fileError, setFileError] = useState("");
  const parsed = useMemo(() => csv ? parseDeliveryCsv(csv) : null, [csv]);
  async function selectFile(file?: File) {
    if (!file) return;
    setName(file.name);
    if (file.size > 500_000) { setCsv(""); setFileError("CSV is larger than 500 KB."); return; }
    setFileError("");
    setCsv(await file.text());
  }
  return <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
    <h2 className="text-lg font-semibold">Import delivery settings</h2>
    <p className="mt-1 text-sm text-neutral-600">Download the current CSV, edit it, then review the parsed state rows before applying. Import updates only the states included in the file.</p>
    <a className="mt-3 inline-block text-sm font-semibold text-brand-800 underline" href="/api/admin/delivery/export">Download current settings CSV</a>
    <label className="mt-4 block text-sm font-medium">Choose a CSV file<input className="mt-1 block w-full text-sm" type="file" accept=".csv,text/csv" onChange={(e) => void selectFile(e.target.files?.[0])} /></label>
    {name && <p className="mt-2 text-xs text-neutral-500">Selected: {name}</p>}
    {fileError && <p role="alert" className="mt-2 text-sm text-red-700">{fileError}</p>}
    {parsed && <div className="mt-3 overflow-x-auto">
      {parsed.errors.length > 0 ? <div role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800"><strong>Fix these CSV issues before importing:</strong><ul className="ml-5 list-disc">{parsed.errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}</ul></div> : <>
        <p className="text-sm font-medium">Preview: {parsed.rows.length} state row{parsed.rows.length === 1 ? "" : "s"}</p>
        <table className="mt-2 min-w-full text-left text-xs"><thead><tr><th className="p-2">State</th><th className="p-2">Fee</th><th className="p-2">Delivery</th><th className="p-2">Enabled</th></tr></thead><tbody>{parsed.rows.map((r) => <tr className="border-t" key={r.state}><td className="p-2">{r.state}</td><td className="p-2">{r.fee == null ? "Not configured" : `₦${r.fee.toLocaleString("en-NG")}`}</td><td className="p-2">{r.estimatedDelivery || "Not set"}</td><td className="p-2">{r.active ? "Yes" : "No"}</td></tr>)}</tbody></table>
        <form action={importDeliveryCsvAction} className="mt-3 flex flex-wrap items-center gap-3"><input type="hidden" name="csv" value={csv} /><label className="flex items-center gap-2 text-sm"><input required type="checkbox" name="confirm" value="yes" />I reviewed this preview and want to apply these rows.</label><button className="admin-btn" disabled={!parsed.rows.length}>Import reviewed rows</button></form>
      </>}
    </div>}
  </section>;
}
