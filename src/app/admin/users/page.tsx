import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { addUserAction, resetUserPasswordAction, toggleUserAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "Users" };

export default async function Users({ searchParams }: { searchParams: { msg?: string } }) {
  await requireAdmin("owner");
  const users = db().prepare("SELECT id, email, name, role, active, created_at FROM users ORDER BY id").all();
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <h1 className="text-2xl">Users</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600">The main owner account comes from ADMIN_EMAIL and ADMIN_PASSWORD in Coolify. Add staff here. Staff can view orders, confirm payments and update order status, but cannot change products, prices, delivery fees, bank details or users.</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500"><tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
          <tbody>
            {users.length ? users.map((u) => (
              <tr key={String(u.id)} className="border-t border-neutral-100">
                <td className="p-3">{String(u.name)}</td><td className="p-3">{String(u.email)}</td><td className="p-3">{String(u.role)}</td>
                <td className="p-3">{Number(u.active) ? "Active" : "Disabled"}</td>
                <td className="flex flex-wrap gap-2 p-3">
                  <form action={toggleUserAction}><input type="hidden" name="id" value={String(u.id)} /><button className="admin-btn-ghost py-1">{Number(u.active) ? "Disable" : "Enable"}</button></form>
                  <form action={resetUserPasswordAction} className="flex gap-1"><input type="hidden" name="id" value={String(u.id)} /><input name="password" type="password" placeholder="New password" className="admin-input w-40 py-1" autoComplete="new-password" /><button className="admin-btn-ghost py-1">Set</button></form>
                </td>
              </tr>
            )) : <tr><td colSpan={5} className="p-4 text-neutral-500">No extra users yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <form action={addUserAction} className="mt-4 grid gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-5">
        <input name="name" placeholder="Name" className="admin-input" required />
        <input name="email" type="email" placeholder="Email" className="admin-input" required />
        <input name="password" type="password" placeholder="Password (10+ characters)" className="admin-input" autoComplete="new-password" required />
        <select name="role" className="admin-input"><option value="staff">Staff</option><option value="owner">Owner</option></select>
        <button className="admin-btn">Add user</button>
      </form>
    </div>
  );
}
