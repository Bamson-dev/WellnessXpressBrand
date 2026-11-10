export const site = {
  name: "WellnessXpressBrand",
  shortName: "WellnessXpress",
  tagline: "Wellness and lifestyle products for everyday living",
  description:
    "WellnessXpressBrand is preparing a better way to make wellness part of your everyday life. Quality products, thoughtful choices and a healthier lifestyle are coming soon.",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://wellnessxpressbrand.com").replace(/\/$/, ""),
  whatsapp: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "").replace(/\D/g, ""),
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
  currency: "NGN",
};

export function whatsappLink(message = "Hello WellnessXpress, I need help with an order.") {
  if (!site.whatsapp) return null;
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(message)}`;
}

export const naira = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);

export const nav = [
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

/** Formats a number like 2347079586361 as +234 707 958 6361 (Nigeria) or +digits otherwise. */
export function displayPhone(n: string) {
  const m = /^234(\d{3})(\d{3})(\d{4})$/.exec(n);
  return m ? `+234 ${m[1]} ${m[2]} ${m[3]}` : n ? `+${n}` : "";
}
