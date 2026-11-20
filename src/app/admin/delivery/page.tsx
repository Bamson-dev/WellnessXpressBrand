import { requirePerm } from "@/lib/auth";
import { deliveryZones } from "@/lib/settings";
import { bulkDeliveryAction, saveDeliveryAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";
import DeliveryImport from "@/components/admin/DeliveryImport";
import UnsavedGuard from "@/components/admin/UnsavedGuard";
import AdminForm from "@/components/admin/AdminForm";

export const metadata = { title: "Delivery" };

export default async function Delivery(props: { searchParams: Promise<{ msg?: string }> }) {
  const searchParams = await props.searchParams;
  await requirePerm("delivery");
  const zones = deliveryZones();
  const covered = zones.filter((z) => z.active).length;
  const missingFees = zones.filter((z) => z.active && (z.fee == null || z.fee < 1)).length;
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Delivery coverage</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600">Free delivery applies to product subtotals of ₦50,000 and above. Orders below that threshold pay the state delivery fee configured here. Use this page to set fees, switch delivery on or off, add delivery times, and keep customer and internal notes.</p>
        </div>
        <a href="/api/admin/delivery-export" className="admin-btn-ghost">Export CSV</a>
      </div>
      <p className={`mt-3 rounded-lg px-4 py-2 text-sm font-medium ${covered === 37 ? "bg-brand-50 text-brand-900" : "bg-amber-50 text-amber-900"}`}>
        Delivery is enabled for {covered} of 37 locations.{covered < 37 ? " Customers in switched-off states cannot check out." : ""}
      </p>

      {missingFees > 0 ? <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{missingFees} enabled locations still need a delivery fee. Orders below ₦50,000 cannot be placed for these locations until you set the fee. Orders of ₦50,000 and above qualify for free delivery.</p> : null}

      <AdminForm action={bulkDeliveryAction} id="bulk" className="mt-4 grid gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-[auto_1fr_auto]">
        <select name="op" className="admin-input w-auto" aria-label="Bulk action">
          <option value="eta">Set delivery time</option><option value="note">Set customer note</option>
          <option value="enable">Switch delivery on</option><option value="disable">Switch delivery off</option>
        </select>
        <input name="bulkEta" placeholder="Text, e.g. 2–4 working days" className="admin-input" aria-label="Bulk text" />
        <button className="admin-btn">Apply to ticked states</button>
        <p className="text-xs text-neutral-500 sm:col-span-3">Tick states in the first column of the table below, then choose an action here.</p>
      </AdminForm>

      <AdminForm action={saveDeliveryAction} className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white" id="zones">
        <UnsavedGuard formId="zones" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr><th className="p-3"><span className="sr-only">Select</span></th><th className="p-3">State</th><th className="p-3">Delivery fee (₦)</th><th className="p-3">On</th><th className="p-3">Delivery time</th><th className="p-3">Customer note</th><th className="p-3">Internal logistics note</th><th className="p-3">Status</th></tr>
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
                  <td className="p-2 text-xs">{z.active ? <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-900">Delivery enabled</span> : <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">Off</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-0 border-t border-neutral-200 bg-white p-4"><button className="admin-btn">Save delivery settings</button></div>
      </AdminForm>

      <DeliveryImport />
    </div>
  );
}
