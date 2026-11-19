import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { markNotificationReadAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "Notifications" };

export default async function Notifications(props: { searchParams: Promise<{ msg?: string }> }) {
  const searchParams = await props.searchParams;
  await requirePerm("notifications");
  const rows = db().prepare("SELECT * FROM admin_notifications ORDER BY (read_at IS NULL) DESC,id DESC LIMIT 250").all();
  const unread = rows.filter((row) => row.read_at == null).length;
  return <div>
    <Flash msg={searchParams.msg} />
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl">Notifications</h1><p className="mt-1 text-sm text-neutral-600">{unread} unread · duplicate events are suppressed.</p></div>
      {unread ? <form action={markNotificationReadAction}><input type="hidden" name="all" value="yes" /><button className="admin-btn-ghost">Mark all read</button></form> : null}
    </div>
    <div className="mt-4 space-y-2">{rows.length ? rows.map((row) => <article key={String(row.id)} className={`rounded-xl border bg-white p-4 ${row.read_at == null ? "border-brand-300" : "border-neutral-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{String(row.title)}{row.read_at == null ? <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-900">New</span> : null}</p><p className="mt-1 text-sm text-neutral-600">{String(row.body)}</p><p className="mt-1 text-xs text-neutral-500">{String(row.created_at)}</p><Link href={String(row.href).startsWith("/admin") ? String(row.href) : "/admin"} className="mt-2 inline-block text-sm font-semibold text-brand-700 underline">Open</Link></div>
        {row.read_at == null ? <form action={markNotificationReadAction}><input type="hidden" name="id" value={String(row.id)} /><button className="text-sm text-brand-700 underline">Mark read</button></form> : null}</div>
    </article>) : <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-neutral-600">No notifications yet.</p>}</div>
  </div>;
}
