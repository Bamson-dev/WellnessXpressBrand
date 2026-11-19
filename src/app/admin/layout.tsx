import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { can, currentAdmin } from "@/lib/auth";
import { logoutAction } from "@/app/admin/actions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false, follow: false } };
const outfit = localFont({ src: "../fonts/Outfit-latin.woff2", variable: "--font-outfit", display: "swap", weight: "300 800" });

import { ADMIN_NAV } from "@/lib/admin-nav";
import AdminForm from "@/components/admin/AdminForm";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await currentAdmin();
  const unread = a && can(a, "notifications") ? Number(db().prepare("SELECT COUNT(*) n FROM admin_notifications WHERE read_at IS NULL").get()?.n || 0) : 0;
  return (
    <div className={`${outfit.variable} min-h-screen bg-neutral-50 font-sans`}>
      {a ? (
        <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white print:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
            <Link href="/admin" className="font-bold text-brand-900">WellnessXpress Admin</Link>
            <span className="hidden text-sm text-neutral-500 sm:inline">{a.email} · {a.role}</span>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/" className="admin-btn-ghost" target="_blank">View store</Link>
              <AdminForm action={logoutAction}><button className="admin-btn-ghost">Sign out</button></AdminForm>
            </div>
          </div>
          <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2" aria-label="Admin">
            {ADMIN_NAV.filter((n) => can(a, n.perm)).map((n) => (
              <Link key={n.href} href={n.href} className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-brand-50 hover:text-brand-900">{n.label}{n.href === "/admin/notifications" && unread ? <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-800" aria-label={`${unread} unread`}>{unread}</span> : null}</Link>
            ))}
          </nav>
        </header>
      ) : null}
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
