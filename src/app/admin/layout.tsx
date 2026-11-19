import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { currentAdmin } from "@/lib/auth";
import { logoutAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false, follow: false } };
const outfit = localFont({ src: "../fonts/Outfit-latin.woff2", variable: "--font-outfit", display: "swap", weight: "300 800" });

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products", owner: true },
  { href: "/admin/categories", label: "Categories", owner: true },
  { href: "/admin/delivery", label: "Delivery fees", owner: true },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/settings", label: "Settings", owner: true },
  { href: "/admin/users", label: "Users", owner: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await currentAdmin();
  return (
    <div className={`${outfit.variable} min-h-screen bg-neutral-50 font-sans`}>
      {a ? (
        <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
            <Link href="/admin" className="font-bold text-brand-900">WellnessXpress Admin</Link>
            <span className="hidden text-sm text-neutral-500 sm:inline">{a.email} · {a.role}</span>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/" className="admin-btn-ghost" target="_blank">View store</Link>
              <form action={logoutAction}><button className="admin-btn-ghost">Sign out</button></form>
            </div>
          </div>
          <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2" aria-label="Admin">
            {NAV.filter((n) => !n.owner || a.role === "owner").map((n) => (
              <Link key={n.href} href={n.href} className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-brand-50 hover:text-brand-900">{n.label}</Link>
            ))}
          </nav>
        </header>
      ) : null}
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
