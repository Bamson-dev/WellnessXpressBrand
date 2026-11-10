export const site = {
  name: "WellnessXpressBrand",
  shortName: "WellnessXpress",
  tagline: "Wellness and lifestyle products for everyday living",
  description:
    "WellnessXpressBrand is an online store for wellness and lifestyle products. Browse the catalogue, order online and get support from our team.",
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
