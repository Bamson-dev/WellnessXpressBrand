"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { confirmationsDb } from "@/lib/payment-confirmations";
import { sendConfirmationPurchase } from "@/lib/meta-confirmation";
import { logAdminActivity } from "@/lib/admin-events";
import { site } from "@/lib/site";

const URL_LIST = "/admin/payment-confirmations";
const go = (msg: string) => redirect(`${URL_LIST}?msg=${encodeURIComponent(msg)}`);

/**
 * Marks a payment confirmation form submission as PAID after the admin has seen the money in the bank account.
 * This is the only place a Purchase is sent to Meta for these submissions, and it is sent once per submission.
 */
export async function markConfirmationPaidAction(f: FormData) {
  const a = await requirePerm("payments");
  const d = confirmationsDb();
  const id = Number(f.get("id"));
  const row = d.prepare("SELECT * FROM payment_confirmations WHERE id = ?").get(id);
  if (!row) return go("Submission not found.");
  if (f.get("confirm") !== "yes") return go("Tick the box to confirm you have seen the money in the bank account.");
  if (row.status === "paid") return go("This submission is already marked paid.");
  const amount = Math.round(Number(String(f.get("verifiedAmount") ?? "").replace(/[₦,\s]/g, "")));
  if (!Number.isFinite(amount) || amount < 1 || amount > 100_000_000) return go("Enter the amount you verified in the bank account.");
  const note = String(f.get("note") ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 300);
  d.prepare("UPDATE payment_confirmations SET status = 'paid', verified_amount = ?, verified_by = ?, paid_at = datetime('now'), admin_note = ? WHERE id = ?").run(amount, a.email, note, id);
  logAdminActivity(a.email, "confirmation_marked_paid", "payment_confirmation", id, `Verified ₦${amount}`);
  const ev = await sendConfirmationPurchase({ id, phone: String(row.phone), amount, tracking: String(row.tracking || "{}"), url: `${site.url}/confirm-payment` });
  d.prepare("UPDATE payment_confirmations SET purchase_event_id = ?, purchase_event_status = ? WHERE id = ?").run(ev.eventId, ev.status, id);
  revalidatePath(URL_LIST);
  go(ev.status.startsWith("sent") ? "Marked as PAID. Purchase sent to Meta." : ev.status === "not_configured" ? "Marked as PAID. Meta Purchase not sent: the Conversions API token is not set." : "Marked as PAID. Meta Purchase failed (" + ev.status + ").");
}
