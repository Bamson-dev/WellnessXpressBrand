import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Activity log" };

export default async function Activity({ searchParams }: { searchParams: { q?: string } }) {
  await requirePerm("activity");
  const q = (searchParams.q || "").trim().slice(0, 100);
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const rows = q
    ? db().prepare("SELECT * FROM admin_activity WHERE actor LIKE ? ESCAPE '\\' OR action LIKE ? ESCAPE '\\' OR entity_type LIKE ? ESCAPE '\\' OR entity_id LIKE ? ESCAPE '\\' OR details LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 250").all(like, like, like, like, like)
    : db().prepare("SELECT * FROM admin_activity ORDER BY id DESC LIMIT 250").all();
  return <div>
    <h1 className="text-2xl">Administrator activity</h1>
    <p className="mt-1 text-sm text-neutral-600">Read-only history of important administrator actions. The log is not editable from the dashboard.</p>
    <form className="mt-4 flex flex-wrap gap-2" action="/admin/activity"><input name="q" defaultValue={q} placeholder="Search admin, action, record or details" className="admin-input max-w-lg" /><button className="admin-btn">Search</button></form>
    <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white"><table className="w-full text-sm"><thead className="bg-neutral-50 text-left text-neutral-600"><tr><th className="p-3">Time</th><th className="p-3">Administrator</th><th className="p-3">Action</th><th className="p-3">Record</th><th className="p-3">Details</th></tr></thead><tbody>
      {rows.length ? rows.map((row) => <tr key={String(row.id)} className="border-t border-neutral-100 align-top"><td className="whitespace-nowrap p-3 text-neutral-500">{String(row.created_at)}</td><td className="p-3">{String(row.actor)}</td><td className="p-3">{String(row.action)}</td><td className="p-3">{String(row.entity_type)} · {String(row.entity_id)}</td><td className="p-3">{String(row.details)}</td></tr>) : <tr><td colSpan={5} className="p-6 text-neutral-500">No activity matches.</td></tr>}
    </tbody></table></div>
  </div>;
}
