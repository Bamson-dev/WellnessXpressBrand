import type { Permission } from "@/lib/permissions";

/** Admin navigation. Each link shows only to admins with its permission; pages check the same permission on the server. */
export const ADMIN_NAV: { href: string; label: string; perm: Permission }[] = [
  { href: "/admin", label: "Dashboard", perm: "dashboard" },
  { href: "/admin/orders", label: "Orders", perm: "orders" },
  { href: "/admin/payment-confirmations", label: "Payment forms", perm: "payments" },
  { href: "/admin/invoices", label: "Invoices", perm: "invoices" },
  { href: "/admin/customers", label: "Customers", perm: "customers" },
  { href: "/admin/notifications", label: "Notifications", perm: "notifications" },
  { href: "/admin/products", label: "Products", perm: "products" },
  { href: "/admin/categories", label: "Categories", perm: "categories" },
  { href: "/admin/media", label: "Media", perm: "media" },
  { href: "/admin/inventory", label: "Inventory", perm: "inventory" },
  { href: "/admin/delivery", label: "Delivery", perm: "delivery" },
  { href: "/admin/promotions", label: "Coupons", perm: "coupons" },
  { href: "/admin/banners", label: "Banners", perm: "banners" },
  { href: "/admin/seo", label: "SEO", perm: "seo" },
  { href: "/admin/reviews", label: "Reviews", perm: "reviews" },
  { href: "/admin/analytics", label: "Analytics", perm: "analytics" },
  { href: "/admin/messages", label: "Messages", perm: "messages" },
  { href: "/admin/settings", label: "Settings", perm: "settings" },
  { href: "/admin/users", label: "Staff", perm: "staff" },
  { href: "/admin/activity", label: "Activity log", perm: "activity" },
];
