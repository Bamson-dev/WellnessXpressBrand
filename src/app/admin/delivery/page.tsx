import { requireAdmin } from "@/lib/auth";
import { deliveryZones } from "@/lib/settings";
import { bulkDeliveryAction, saveDeliveryAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";
import DeliveryImport from "@/components/admin/DeliveryImport";
import UnsavedGuard from "@/components/admin/UnsavedGuard";

export const metadata = { title: "Delivery" };

export default async function Delivery({ searchParams }: { searchParams: { msg?: string } }) {
  await requireAdmin("owner");
  const zones = deliveryZones();
  const covered = zones.filter((z) => z.active).length;
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Delivery coverage</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600">Delivery is free across Nigeria. There are no delivery fees to set. Use this page to switch delivery on or off for each state, add delivery times you know to be accurate, and keep notes. Customers see the delivery time and the customer note at checkout. Internal notes stay in the dashboard.</p>
        </div>
        <a href="/api/admin/delivery-export" className="admin-btn-ghost">Export CSV</a>
      </div>
      <p className={`mt-3 rounded-lg px-4 py-2 text-sm font-medium ${covered === 37 ? "bg-brand-50 text-brand-900" : "bg-amber-50 text-amber-900"}`}>
        Free delivery is on for {covered} of 37 locations.{covered < 37 ? " Customers in switched-off states cannot check out." : ""}
      </p>

      <form action={bulkDeliveryAction} id="bulk" className="mt-4 grid gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-[auto_1fr_auto]">
        <select name="op" className="admin-input w-auto" aria-label="Bulk action">
          <option value="eta">Set delivery time</option><option value="note">Set customer note</option>
          <option value="enable">Switch delivery on</option><option value="disable">Switch delivery off</option>
        </select>
        <input name="bulkEta" placeholder="Text, e.g. 2–4 working days" className="admin-input" aria-label="Bulk text" />
        <button className="admin-btn">Apply to ticked states</button>
        <p className="text-xs text-neutral-500 sm:col-span-3">Tick states in the first column of the table below, then choose an action here.</p>
      </form>

      <form action={saveDeliveryAction} className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white" id="zones">
        <UnsavedGuard formId="zones" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr><th className="p-3"><span className="sr-only">Select</span></th><th className="p-3">State</th><th className="p-3">On</th><th className="p-3">Delivery time</th><th className="p-3">Customer note</th><th className="p-3">Internal logistics note</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.state} className="border-t border-neutral-100">
                  <td className="p-2 pl-3"><input type="checkbox" name="states" value={z.state} form="bulk" className="h-4 w-4 accent-brand-700" aria-label={`Select ${z.state}`} /></td>
                  <td className="p-2 font-medium">{z.state}</td>
                  <td className="p-2"><input type="checkbox" name={`active_${z.state}`} defaultChecked={z.active} className="h-4 w-4 accent-brand-700" aria-label={`Deliver to ${z.state}`} /></td>
                  <td className="p-2"><input name={`eta_${z.state}`} defaultValue={z.eta} placeholder="Not set" maxLength={80} className="admin-input w-40" aria-label={`Delivery time for ${z.state}`} /></td>
                  <td className="p-2"><input name={`note_${z.state}`} defaultValue={z.note} maxLength={160} className="admin-input w-48" aria-label={`Customer note for ${z.state}`} /></td>
                  <td className="p-2"><input name={`internal_${z.state}`} defaultValue={z.internalNote} maxLength={300} className="admin-input w-48" aria-label={`Internal note for ${z.state}`} /></td>
                  <td className="p-2 text-xs">{z.active ? <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-900">Free delivery</span> : <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">Off</span>}</td>
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
