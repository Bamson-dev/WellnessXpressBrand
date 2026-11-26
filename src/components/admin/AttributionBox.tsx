import type { OrderRow } from "@/lib/orders";

type Touch = { source?: string; medium?: string; campaign?: string; content?: string; term?: string; fbclid?: string; ttclid?: string };
const line = (t?: Touch | null) => (t && (t.source || t.medium || t.campaign || t.content || t.term || t.fbclid || t.ttclid)
  ? [t.source, t.medium, t.campaign, t.content, t.term].filter(Boolean).join(" / ") || "click id only" : "none");

/** Marketing source of a funnel order, as captured from the visitor's link. Shown for admins only. */
export default function AttributionBox({ o }: { o: OrderRow }) {
  let t: Record<string, unknown> = {};
  try { t = JSON.parse(String(o.tracking || "{}")); } catch {}
  const funnel = !!t.funnel;
  const first = t.first as Touch | null, last = t.last as Touch | null;
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 py-1.5"><dt className="text-neutral-500">{k}</dt><dd className="break-all text-right font-medium">{v}</dd></div>;
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg">Marketing source</h2>
      <dl className="mt-2 text-sm">
        {row("Platform", funnel ? String(t.platform || "unknown") : "Store (no funnel)")}
        {funnel ? <>
          {row("First touch", line(first))}
          {row("Last touch", line(last))}
          {row("Campaign", last?.campaign || first?.campaign || "—")}
          {row("Facebook click ID", last?.fbclid || first?.fbclid ? "yes" : "no")}
          {row("TikTok click ID", t.ttclid ? "yes" : "no")}
          {row("Meta Purchase", String(o.purchase_event_status || "not sent"))}
          {row("TikTok Purchase", String(t.tt_status || "not sent"))}
        </> : null}
      </dl>
    </section>
  );
}
