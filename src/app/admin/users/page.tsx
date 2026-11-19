import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS, parsePermissions } from "@/lib/permissions";
import { addUserAction, resetUserPasswordAction, setUserPermissionsAction, toggleUserAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";
import AdminForm from "@/components/admin/AdminForm";

export const metadata = { title: "Staff" };

function PermGrid({ checked, disabled }: { checked: string[]; disabled?: boolean }) {
  return (
    <fieldset className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3" disabled={disabled}>
      <legend className="sr-only">Permissions</legend>
      {PERMISSIONS.map(([k, label]) => (
        <label key={k} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" name="perms" value={k} defaultChecked={checked.includes(k)} className="h-4 w-4 accent-brand-700" /> {label}</label>
      ))}
    </fieldset>
  );
}

export default async function Users(props: { searchParams: Promise<{ msg?: string }> }) {
  const searchParams = await props.searchParams;
  const me = await requirePerm("staff");
  const users = db().prepare("SELECT id, email, name, role, active, permissions, created_at FROM users ORDER BY id").all();
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <h1 className="text-2xl">Staff and permissions</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-600">The main owner account comes from ADMIN_EMAIL and ADMIN_PASSWORD in Coolify and always has full access. Owners have every permission. Staff see and do only what you tick. Changes apply on their next page load. Every change is recorded in the activity log.</p>
      <div className="mt-4 space-y-3">
        {users.length ? users.map((u) => {
          const perms = parsePermissions(u.permissions);
          const self = String(me.uid) === String(u.id);
          const locked = me.role !== "owner" && u.role === "owner";
          return (
            <article key={String(u.id)} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{String(u.name)} <span className="font-normal text-neutral-500">· {String(u.email)}</span></p>
                <p className="text-sm"><span className="rounded-full bg-neutral-100 px-2 py-0.5">{String(u.role)}</span> <span className={`ml-1 rounded-full px-2 py-0.5 ${Number(u.active) ? "bg-brand-50 text-brand-900" : "bg-red-50 text-red-800"}`}>{Number(u.active) ? "Active" : "Disabled"}</span></p>
              </div>
              <AdminForm action={setUserPermissionsAction} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={String(u.id)} />
                <label className="flex items-center gap-2 text-sm font-semibold">Role
                  <select name="role" defaultValue={String(u.role)} className="admin-input w-auto py-1" disabled={self || locked}><option value="staff">Staff</option>{me.role === "owner" || u.role === "owner" ? <option value="owner">Owner (full access)</option> : null}</select>
                </label>
                <PermGrid checked={u.role === "owner" ? PERMISSIONS.map(([k]) => k) : perms} disabled={self || locked} />
                {!self && !locked ? <button className="admin-btn">Save permissions</button> : <p className="text-xs text-neutral-500">{self ? "You cannot change your own access." : "Only an owner can change an owner account."}</p>}
              </AdminForm>
              {!self && !locked ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                  <AdminForm action={toggleUserAction}><input type="hidden" name="id" value={String(u.id)} /><button className="admin-btn-ghost py-1">{Number(u.active) ? "Disable account" : "Enable account"}</button></AdminForm>
                  <AdminForm action={resetUserPasswordAction} className="flex gap-1"><input type="hidden" name="id" value={String(u.id)} /><input name="password" type="password" placeholder="New password" aria-label={`New password for ${String(u.email)}`} className="admin-input w-40 py-1" autoComplete="new-password" /><button className="admin-btn-ghost py-1">Set password</button></AdminForm>
                </div>
              ) : null}
            </article>
          );
        }) : <p className="rounded-xl border border-neutral-200 bg-white p-4 text-neutral-500">No staff accounts yet.</p>}
      </div>
      <AdminForm action={addUserAction} className="mt-6 space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-lg">Add a staff account</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          <input name="name" placeholder="Name" aria-label="Name" className="admin-input" required />
          <input name="email" type="email" placeholder="Email" aria-label="Email" className="admin-input" required />
          <input name="password" type="password" placeholder="Password (10+ characters)" aria-label="Password" className="admin-input" autoComplete="new-password" required />
          <select name="role" aria-label="Role" className="admin-input"><option value="staff">Staff</option>{me.role === "owner" ? <option value="owner">Owner (full access)</option> : null}</select>
        </div>
        <PermGrid checked={["dashboard", "orders"]} />
        <button className="admin-btn">Add user</button>
      </AdminForm>
    </div>
  );
}
