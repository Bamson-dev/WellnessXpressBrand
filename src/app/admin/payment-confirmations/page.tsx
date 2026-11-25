import { requirePerm } from "@/lib/auth";
import { confirmationsDb } from "@/lib/payment-confirmations";
import { markConfirmationPaidAction } from "@/app/admin/confirmation-actions";
import Flash from "@/components/admin/Flash";
import AdminForm from "@/components/admin/AdminForm";

export const metadata = { title: "Payment forms" };
const naira = (n: unknown) => "₦" + Number(n).toLocaleString("en-NG");

export default async function PaymentConfirmations(props: { searchParams: Promise<{ msg?: string }> }) {
  const searchParams = await props.searchParams;
  await requirePerm("payments");
  const rows = confirmationsDb().prepare("SELECT * FROM payment_confirmations ORDER BY (status = 'paid'), id DESC LIMIT 300").all();
  const waiting = rows.filter((r) => r.status !== "paid").length;
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <h1 className="text-2xl">Payment confirmation forms</h1>
      <p className="mt-1 text-sm text-neutral-600">{waiting} awaiting verification. Check the money in the bank account first, then mark the submission PAID. Marking PAID sends one Purchase event to Meta.</p>
      <div className="mt-4 space-y-3">
        {rows.length ? rows.map((r) => {
          const paid = r.status === "paid";
          return (
            <article key={String(r.id)} className={`rounded-xl border bg-white p-4 text-sm ${paid ? "border-neutral-200" : "border-brand-300"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-base font-semibold">{String(r.full_name)} <span className="font-normal text-neutral-500">· #{String(r.id)}</span></p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${paid ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{paid ? "PAID" : "AWAITING VERIFICATION"}</span>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <div><dt className="inline text-neutral-500">Phone: </dt><dd className="inline">{String(r.phone)}</dd></div>
                <div><dt className="inline text-neutral-500">Amount paid: </dt><dd className="inline">{naira(r.amount_paid)}</dd></div>
                <div><dt className="inline text-neutral-500">State: </dt><dd className="inline">{String(r.state)}</dd></div>
                <div><dt className="inline text-neutral-500">Submitted: </dt><dd className="inline">{String(r.submitted_at)} UTC</dd></div>
                <div className="sm:col-span-2"><dt className="inline text-neutral-500">Address: </dt><dd className="inline whitespace-pre-line">{String(r.address)}</dd></div>
              </dl>
              <p className="mt-3"><a href={`/api/admin/confirmation-receipt/${r.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">View payment receipt</a></p>
              {paid ? (
                <p className="mt-3 text-neutral-600">Verified {naira(r.verified_amount)} by {String(r.verified_by)} on {String(r.paid_at)} UTC. Meta Purchase: {String(r.purchase_event_status) || "not sent"}.</p>
              ) : (
                <AdminForm action={markConfirmationPaidAction}>
                  <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-neutral-50 p-3">
                    <input type="hidden" name="id" value={String(r.id)} />
                    <label className="text-sm">Amount seen in bank (₦)<input name="verifiedAmount" inputMode="numeric" defaultValue={String(r.amount_paid)} className="field mt-1 w-40" /></label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" /> I checked the bank account and the money is there</label>
                    <button className="admin-btn">Mark as PAID</button>
                  </div>
                </AdminForm>
              )}
            </article>
          );
        }) : <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-neutral-600">No submissions yet.</p>}
      </div>
    </div>
  );
}
