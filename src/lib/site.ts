export const site = {
  name: "WellnessXpressBrand",
  shortName: "WellnessXpress",
  tagline: "Your Weightloss Journey Starts Here.",
  description:
    "Shop WellnessXpress weight-management and wellness products in Nigeria. Order without an account, pay by bank transfer and get delivery to your state.",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://wellnessxpressbrand.com").replace(/\/$/, ""),
  currency: "NGN",
  /* Build-time fallbacks used by the Coming Soon page. The store reads live contact details from admin settings. */
  whatsapp: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "2347079596063").replace(/\D/g, ""),
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "wellnessxpressglobal@gmail.com",
};

export function whatsappLink(message = "Hello WellnessXpressBrand. I need help with my order.") {
  return site.whatsapp ? `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(message)}` : null;
}

export const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");

/** Formats 2347079596063 as +234 707 959 6063. */
export function displayPhone(n: string) {
  const d = (n || "").replace(/\D/g, "");
  const m = /^234(\d{3})(\d{3})(\d{4})$/.exec(d);
  return m ? `+234 ${m[1]} ${m[2]} ${m[3]}` : d ? `+${d}` : "";
}

export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
  "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];

/** Normalises Nigerian phone numbers to 234XXXXXXXXXX. Returns "" when invalid. */
export function normalisePhone(raw: string) {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = "234" + d.slice(1);
  if (d.length === 10 && /^[789]/.test(d)) d = "234" + d;
  return /^234[789][01]\d{8}$/.test(d) ? d : "";
}

export const PAYMENT_STATUS: Record<string, string> = {
  pending_payment: "Pending Payment",
  awaiting_verification: "Awaiting Verification",
  paid: "Paid",
  payment_failed: "Payment Failed",
};
export const FULFILMENT_STATUS: Record<string, string> = {
  unfulfilled: "Not started",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** One combined label for customers, matching the business order statuses. */
export function orderStatusLabel(o: { payment_status: string; fulfilment_status: string; total: number | null }) {
  if (o.fulfilment_status === "cancelled") return "Cancelled";
  if (o.fulfilment_status === "delivered") return "Delivered";
  if (o.fulfilment_status === "shipped") return "Shipped";
  if (o.fulfilment_status === "processing") return "Processing";
  if (o.payment_status === "paid") return "Paid";
  if (o.payment_status === "payment_failed") return "Payment Failed";
  if (o.payment_status === "awaiting_verification") return "Awaiting Verification";
  if (o.total == null) return "Awaiting delivery fee";
  return "Pending Payment";
}
