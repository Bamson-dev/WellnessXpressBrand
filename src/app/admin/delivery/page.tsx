import { requireAdmin } from "@/lib/auth";
import { deliveryZones } from "@/lib/settings";
import { NIGERIAN_STATES } from "@/lib/site";
import { saveDeliveryAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "Delivery fees" };

export default async function Delivery({ searchParams }: { searchParams: { msg?: string } }) {
  await requireAdmin("owner");
  const z = new Map(deliveryZones().map((x) => [x.state, x]));
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <h1 className="text-2xl">Delivery fees by state</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600">Enter a fee for each state you deliver to. If a state has no fee, customers can still order, but the order waits until you set its fee and the customer is told not to pay yet.</p>
      <form action={saveDeliveryAction} className="mt-4 rounded-xl border border-neutral-200 bg-white">
        <div className="grid grid-cols-[1fr_120px_70px] gap-2 border-b border-neutral-200 bg-neutral-50 p-3 text-xs font-semibold uppercase text-neutral-500 sm:grid-cols-[1fr_140px_80px_1fr]">
          <span>State</span><span>Fee (₦)</span><span>On</span><span className="hidden sm:block">Note (internal)</span>
        </div>
        {NIGERIAN_STATES.map((st) => {
          const r = z.get(st);
          return (
            <div key={st} className="grid grid-cols-[1fr_120px_70px] items-center gap-2 border-b border-neutral-100 px-3 py-2 sm:grid-cols-[1fr_140px_80px_1fr]">
              <span className="text-sm font-medium">{st}</span>
              <input name={`fee_${st}`} inputMode="numeric" defaultValue={r?.fee ?? ""} placeholder="Not set" className="admin-input" aria-label={`Delivery fee for ${st}`} />
              <input type="checkbox" name={`active_${st}`} defaultChecked={r ? r.active : true} className="h-4 w-4 accent-brand-700" aria-label={`Use fee for ${st}`} />
              <input name={`note_${st}`} defaultValue={r?.note ?? ""} className="admin-input hidden sm:block" aria-label={`Note for ${st}`} />
            </div>
          );
        })}
        <div className="p-4"><button className="admin-btn">Save delivery fees</button></div>
      </form>
    </div>
  );
}
