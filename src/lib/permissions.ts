/** Granular admin permissions. The owner always has every permission. */
export const PERMISSIONS = [
  ["dashboard", "Dashboard"],
  ["orders", "Orders (view and update status)"],
  ["payments", "Payment verification"],
  ["customers", "Customers"],
  ["invoices", "Invoices"],
  ["products", "Products"],
  ["categories", "Categories"],
  ["media", "Media library"],
  ["inventory", "Inventory"],
  ["delivery", "Delivery management"],
  ["coupons", "Coupons"],
  ["reviews", "Reviews and testimonials"],
  ["notifications", "Notifications"],
  ["messages", "Contact messages"],
  ["analytics", "Analytics"],
  ["reports", "Reports and CSV exports"],
  ["banners", "Banners and homepage"],
  ["seo", "SEO"],
  ["settings", "Store settings"],
  ["staff", "Staff management"],
  ["activity", "Activity log"],
] as const;
export type Permission = (typeof PERMISSIONS)[number][0];
export const ALL_PERMISSIONS = PERMISSIONS.map(([k]) => k) as Permission[];
/** What a staff account could do before granular permissions existed. Used when no permissions are saved. */
export const LEGACY_STAFF: Permission[] = ["dashboard", "orders", "payments", "customers", "notifications", "messages", "reviews"];
export const isPermission = (x: string): x is Permission => (ALL_PERMISSIONS as string[]).includes(x);
export function parsePermissions(raw: unknown): Permission[] {
  // No saved value at all = a pre-permissions legacy account: keep its historical access.
  if (raw == null || raw === "") return [...LEGACY_STAFF];
  try {
    const v = JSON.parse(String(raw));
    // A saved value that is not an array, or unparseable JSON, is corruption — fail CLOSED (no permissions)
    // rather than silently granting LEGACY_STAFF, which includes payment verification.
    if (!Array.isArray(v)) return [];
    return v.map(String).filter(isPermission);
  } catch {
    return [];
  }
}
