import { requireAdmin } from "@/lib/auth";
import { deliveryZones } from "@/lib/settings";
import { naira } from "@/lib/site";
import { bulkDeliveryAction, saveDeliveryAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";
import DeliveryImport from "@/components/admin/DeliveryImport";
import UnsavedGuard from "@/components/admin/UnsavedGuard";

export const metadata = { title: "Delivery fees" };

export default async function Delivery({ searchParams }: { searchParams: { msg?: string } }) {
  await requireAdmin("owner");
  const zones = deliveryZones();
  const live = zones.filter((z) => z.active && z.fee != null).length;
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Delivery fees by state</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600">All 36 states and the FCT are listed. Customers can only check out to a state that is switched on and has a fee. The fee is shown at checkout, saved on the order, and paid separately from the product payment. Changing a fee here does not change orders already placed.</p>
        </div>
        <a href="/api/admin/delivery-export" className="admin-btn-ghost">Export CSV</a>
      </div>
      <p className={`mt-3 rounded-lg px-4 py-2 text-sm font-medium ${live ? "bg-brand-50 text-brand-900" : "bg-amber-50 text-amber-900"}`}>
        {live ? `${live} of 37 locations are open for checkout.` : "No location is open for checkout yet. Enter fees and switch states on, or customers cannot place orders."}
      </p>

      <form action={bulkDeliveryAction} id="bulk" className="mt-4 grid gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-[auto_1fr_1fr_auto]">
        <select name="op" className="admin-input w-auto" aria-label="Bulk action">
          <option value="fee">Set fee and switch on</option><option value="eta">Set delivery time</option>
          <option value="enable">Switch on</option><option value="disable">Switch off</option><option value="clear">Remove fee (unavailable)</option>
        </select>
        <input name="bulkFee" inputMode="numeric" placeholder="Fee in ₦ (for Set fee)" className="admin-input" aria-label="Bulk fee" />
        <input name="bulkEta" placeholder="Delivery time, e.g. 2–4 working days" className="admin-input" aria-label="Bulk delivery time" />
        <button className="admin-btn">Apply to ticked states</button>
        <p className="text-xs text-neutral-500 sm:col-span-4">Tick states in the first column of the table below, then choose an action here.</p>
      </form>

      <form action={saveDeliveryAction} className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white" id="zones">
        <UnsavedGuard formId="zones" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr><th className="p-3"><span className="sr-only">Select</span></th><th className="p-3">State</th><th className="p-3">Fee (₦)</th><th className="p-3">On</th><th className="p-3">Delivery time</th><th className="p-3">Note (internal)</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.state} className="border-t border-neutral-100">
                  <td className="p-2 pl-3"><input type="checkbox" name="states" value={z.state} form="bulk" className="h-4 w-4 accent-brand-700" aria-label={`Select ${z.state}`} /></td>
                  <td className="p-2 font-medium">{z.state}</td>
                  <td className="p-2"><input name={`fee_${z.state}`} inputMode="numeric" defaultValue={z.fee ?? ""} placeholder="Not set" className="admin-input w-28" aria-label={`Delivery fee for ${z.state}`} /></td>
                  <td className="p-2"><input type="checkbox" name={`active_${z.state}`} defaultChecked={z.active} className="h-4 w-4 accent-brand-700" aria-label={`Deliver to ${z.state}`} /></td>
                  <td className="p-2"><input name={`eta_${z.state}`} defaultValue={z.eta} placeholder="e.g. 1–3 working days" className="admin-input w-48" aria-label={`Delivery time for ${z.state}`} /></td>
                  <td className="p-2"><input name={`note_${z.state}`} defaultValue={z.note} className="admin-input w-48" aria-label={`Note for ${z.state}`} /></td>
                  <td className="p-2 text-xs">{z.fee != null && z.active ? <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-900">Open · {naira(z.fee)}</span> : <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">{z.fee == null ? "No fee" : "Off"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-0 border-t border-neutral-200 bg-white p-4"><button className="admin-btn">Save delivery settings</button></div>
      </form>

      <DeliveryImport />
    </div>
  );
}
