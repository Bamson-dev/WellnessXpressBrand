"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { confirmationsDb } from "@/lib/payment-confirmations";
import { orderItems } from "@/lib/orders";
import { sendConfirmationPurchase } from "@/lib/meta-confirmation";
import { sendTikTokPurchase } from "@/lib/capi-funnel";
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
  // Atomic claim: only the first Mark-as-Paid wins; a concurrent duplicate gets changes=0 and sends no Purchase.
  const claimed = d.prepare("UPDATE payment_confirmations SET status = 'paid', verified_amount = ?, verified_by = ?, paid_at = datetime('now'), admin_note = ? WHERE id = ? AND status != 'paid'").run(amount, a.email, note, id);
  if (Number(claimed.changes) !== 1) return go("This submission is already marked paid.");
  logAdminActivity(a.email, "confirmation_marked_paid", "payment_confirmation", id, `Verified ₦${amount}`);
  // Cross-path guard: if this submission's order was already verified on the order screen and a production
  // Purchase already reached a platform from there, that platform must not receive a second one from here —
  // the two screens are two views of one payment. The order's items, when known, also describe the event
  // contents truthfully instead of always naming the 3-in-1 combo.
  const orderNumber = String(row.order_number || "");
  let orderMetaSent = false;
  let orderTtSent = false;
  let eventItems: { id: string; name: string; price: number; qty: number }[] | undefined;
  let contentName: string | undefined;
  if (orderNumber) {
    const ord = d.prepare("SELECT id, purchase_event_status, tracking FROM orders WHERE number = ?").get(orderNumber) as { id?: number; purchase_event_status?: string; tracking?: string } | undefined;
    if (ord) {
      orderMetaSent = String(ord.purchase_event_status || "") === "sent";
      try { orderTtSent = (JSON.parse(String(ord.tracking || "{}")) as { tt_status?: string }).tt_status === "sent"; } catch { /* unparseable tracking: treat as not sent */ }
      const its = orderItems(Number(ord.id));
      if (its.length) {
        eventItems = its.map((i) => ({ id: i.sku, name: i.name, price: Number(i.unit_price), qty: Number(i.qty) }));
        contentName = its.map((i) => i.name).join(", ").slice(0, 100);
      }
    }
  }
  const ev = orderMetaSent ? { status: "already_sent", eventId: "pu_" + orderNumber } : await sendConfirmationPurchase({ id, phone: String(row.phone), amount, tracking: String(row.tracking || "{}"), url: `${site.url}/confirm-payment`, contentName });
  d.prepare("UPDATE payment_confirmations SET purchase_event_id = ?, purchase_event_status = ? WHERE id = ?").run(ev.eventId, ev.status, id);
  // TikTok Purchase for this submission too, with the same stable event id as Meta ("pc_<id>"), tracked in its
  // own column so the two platforms never overwrite each other. Only an exact prior "sent" suppresses a resend;
  // a TikTok failure never affects the payment confirmation or the Meta result.
  let ttStatus = String(row.tiktok_event_status || "");
  if (orderTtSent) {
    ttStatus = "already_sent";
    d.prepare("UPDATE payment_confirmations SET tiktok_event_status = ? WHERE id = ?").run(ttStatus, id);
  } else if (ttStatus !== "sent") {
    const tt = await sendTikTokPurchase({ name: "Purchase", eventId: ev.eventId, number: "PC" + id, phone: String(row.phone), value: amount, url: `${site.url}/confirm-payment`, tracking: String(row.tracking || "{}"), items: eventItems });
    ttStatus = tt;
    d.prepare("UPDATE payment_confirmations SET tiktok_event_status = ? WHERE id = ?").run(ttStatus, id);
  }
  revalidatePath(URL_LIST);
  // Strict status matching: "sent" is a production Purchase; "sent_test" went to Meta Test Events only and is NOT a real purchase.
  const metaMsg = ev.status === "sent" ? "Purchase sent to Meta." : ev.status === "already_sent" ? "Purchase was already sent to Meta when this order was verified — not sent again." : ev.status === "sent_test" ? "Purchase sent to Meta TEST Events only (META_PURCHASE_TEST_EVENT_CODE is set) — this is not a production purchase." : ev.status === "not_configured" ? "Meta Purchase not sent: the Conversions API token is not set." : "Meta Purchase failed (" + ev.status + ").";
  const ttMsg = ttStatus === "sent" ? " Purchase sent to TikTok." : ttStatus === "already_sent" ? " TikTok Purchase was already sent when this order was verified — not sent again." : ttStatus === "sent_test" ? " TikTok event went to TikTok TEST events only." : ttStatus === "not_configured" ? " TikTok Purchase not sent: TikTok is not configured." : " TikTok Purchase failed (" + ttStatus + ").";
  go("Marked as PAID. " + metaMsg + ttMsg);
}
