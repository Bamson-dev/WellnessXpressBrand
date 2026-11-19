import { requireAdmin } from "@/lib/auth";
import { deliveryZones } from "@/lib/settings";
import { NIGERIAN_STATES } from "@/lib/site";
import { saveDeliveryAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";
import DeliveryCsvImport from "@/components/admin/DeliveryCsvImport";
import { db } from "@/lib/db";
import { saveBulkDeliveryAction } from "@/app/admin/actions";

export const metadata = { title: "Delivery and Shipping" };

export default async function Delivery({ searchParams }: { searchParams: { msg?: string } }) {
  await requireAdmin("owner");
  const z = new Map(deliveryZones().map((x) => [x.state, x]));
  const history = db().prepare("SELECT state,previous_config,new_config,actor,created_at FROM delivery_zone_history ORDER BY id DESC LIMIT 50").all();
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <h1 className="text-2xl">Delivery and shipping by state</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600">Configure only confirmed fees and delivery estimates. If a state has no fee, customers can still order and the delivery charge is agreed separately.</p>
      <form action={saveDeliveryAction} className="mt-4 rounded-xl border border-neutral-200 bg-white">
        <div className="grid grid-cols-[1fr_112px_56px] gap-2 border-b border-neutral-200 bg-neutral-50 p-3 text-xs font-semibold uppercase text-neutral-500 xl:grid-cols-[1fr_130px_65px_180px_1fr]">
          <span>State</span><span>Fee (₦)</span><span>On</span><span className="hidden xl:block">Estimated delivery</span><span className="hidden xl:block">Note (internal)</span>
        </div>
        {NIGERIAN_STATES.map((st) => {
          const r = z.get(st);
          return (
            <div key={st} className="grid grid-cols-[1fr_112px_56px] items-center gap-2 border-b border-neutral-100 px-3 py-2 xl:grid-cols-[1fr_130px_65px_180px_1fr]">
              <span className="text-sm font-medium">{st}</span>
              <input name={`fee_${st}`} type="number" min="0" max="100000000" step="1" defaultValue={r?.fee ?? ""} placeholder="Not set" className="admin-input" aria-label={`Delivery fee for ${st}`} />
              <input type="checkbox" name={`active_${st}`} defaultChecked={r ? r.active : true} className="h-4 w-4 accent-brand-700" aria-label={`Use fee for ${st}`} />
              <div className="col-span-full grid gap-2 xl:col-span-2 xl:grid-cols-2">
                <label className="text-xs text-neutral-600">Estimated delivery<input name={`estimate_${st}`} defaultValue={r?.estimatedDelivery ?? ""} placeholder="Not set" className="admin-input mt-1" aria-label={`Estimated delivery for ${st}`} /></label>
                <label className="text-xs text-neutral-600">Internal note<input name={`note_${st}`} defaultValue={r?.note ?? ""} className="admin-input mt-1" aria-label={`Note for ${st}`} /></label>
              </div>
            </div>
          );
        })}
        <div className="p-4"><button className="admin-btn">Save delivery fees</button></div>
      </form>
      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Bulk update selected states</h2>
        <p className="mt-1 text-sm text-neutral-600">Choose one or more states and set the same fee. Existing enablement, estimates, and notes remain intact.</p>
        <form action={saveBulkDeliveryAction} className="mt-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{NIGERIAN_STATES.map((state) => <label key={state} className="flex items-center gap-2 text-sm"><input type="checkbox" name={`state_${state}`} />{state}</label>)}</div>
          <div className="mt-4 flex flex-wrap items-center gap-3"><label className="text-sm">Common fee (₦)<input className="admin-input ml-2 w-40" name="fee" type="number" min="0" max="100000000" step="1" required /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" required />Confirm updating the selected states</label><button className="admin-btn">Apply bulk fee</button></div>
        </form>
      </section>
      <DeliveryCsvImport />
      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Recent delivery configuration history</h2>
        {history.length ? <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr><th className="p-2">When</th><th className="p-2">State</th><th className="p-2">Previous</th><th className="p-2">Updated</th><th className="p-2">Admin</th></tr></thead><tbody>{history.map((row, i) => { const before = JSON.parse(String(row.previous_config || "{}")); const after = JSON.parse(String(row.new_config || "{}")); return <tr className="border-t" key={`${row.state}-${row.created_at}-${i}`}><td className="p-2 whitespace-nowrap">{String(row.created_at)}</td><td className="p-2">{String(row.state)}</td><td className="p-2">{before.fee == null ? "Not set" : `₦${Number(before.fee).toLocaleString("en-NG")}`} · {before.active === 0 ? "Disabled" : "Enabled"}</td><td className="p-2">{after.fee == null ? "Not set" : `₦${Number(after.fee).toLocaleString("en-NG")}`} · {after.active === 0 ? "Disabled" : "Enabled"}</td><td className="p-2">{String(row.actor)}</td></tr>; })}</tbody></table></div> : <p className="mt-2 text-sm text-neutral-500">No delivery changes recorded yet.</p>}
      </section>
    </div>
  );
}
