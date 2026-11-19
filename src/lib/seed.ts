import type { DB } from "@/lib/db";

/*
 * Initial catalogue from the two price lists supplied by the business (WhatsApp screenshots, Nov 2026).
 * List A = "1 month / 2 weeks" list. List B = "Mini / Maxi / small (s) / big (b)" list.
 * The lists overlap and their prices differ, so every price is kept as its own variant and flagged
 * for confirmation in the admin dashboard. No price has been changed or merged.
 * Descriptions do not contain benefits, claims or usage instructions. Label text is quoted only where
 * it is legible on the supplied product photographs.
 */

const IMG = "/images/products";
type V = { label: string; size?: string; duration?: string; price: number; source: string; flag?: boolean };
type P = {
  slug: string; name: string; type: "single" | "combo"; category: string; short: string; description: string;
  ingredients?: string; images: string[]; status: string; featured?: boolean; review?: string; variants: V[];
  items?: { slug: string | null; name: string; size?: string; qty?: string }[];
};

const A = "Price list A (1 month / 2 weeks)";
const B = "Price list B (small / big)";

const catalogue: P[] = [
  {
    slug: "trim-down-coffee", name: "Trim Down Coffee", type: "single", category: "individual",
    short: "WellnessXpress Weightloss Trim Down Coffee in a screw-top jar.",
    description: "Weightloss Trim Down Coffee from WellnessXpress, supplied in a white screw-top jar with the WellnessXpress label.",
    images: [`${IMG}/individual/trim-down-coffee.webp`], status: "published", featured: true,
    review: "Two prices supplied: 1 Month ₦12,500 and an additional ₦10,000 price entry. The size or duration for the ₦10,000 entry was not supplied; confirm before relabelling it.",
    variants: [
      { label: "1 Month", duration: "1 month", price: 12500, source: A, flag: true },
      { label: "Unspecified option", price: 10000, source: "Additional individual price entry", flag: true },
    ],
  },
  {
    slug: "get-snatched-oil", name: "Get Snatched Oil", type: "single", category: "individual",
    short: "WellnessXpress Get Snatched Oil in a nozzle-tip bottle.",
    description: "Get Snatched Oil from WellnessXpress, supplied in an amber bottle with a nozzle cap. The label reads \"Firm - Tone - Tighten\".",
    images: [`${IMG}/individual/get-snatched-oil.webp`], status: "published", featured: true,
    review: "Both price lists give ₦15,000. Confirm the bottle size.",
    variants: [{ label: "1 Month", duration: "1 month", price: 15000, source: `${A}; also ₦15,000 in ${B}` }],
  },
  {
    slug: "tummy-balance", name: "Tummy Balance", type: "single", category: "individual",
    short: "WellnessXpress Tummy Balance in a resealable pouch.",
    description: "Tummy Balance from WellnessXpress, supplied in a black resealable pouch with the WellnessXpress label.",
    images: [`${IMG}/individual/tummy-balance.webp`], status: "published", featured: true,
    review: "Four prices supplied: 1 Month ₦25,000 and 2 Weeks ₦12,500 (list A); Small ₦12,000 and Big ₦22,000 (list B). Confirm which options to sell and the pouch size for each.",
    variants: [
      { label: "2 Weeks", duration: "2 weeks", price: 12500, source: A, flag: true },
      { label: "1 Month", duration: "1 month", price: 25000, source: A, flag: true },
      { label: "Small", size: "Small", price: 12000, source: B, flag: true },
      { label: "Big", size: "Big", price: 22000, source: B, flag: true },
    ],
  },
  {
    slug: "appetite-suppressant", name: "Appetite Suppressant", type: "single", category: "individual",
    short: "WellnessXpress Appetite Suppressant in a resealable pouch.",
    description: "Appetite Suppressant from WellnessXpress, supplied in a black resealable pouch with the WellnessXpress label.",
    images: [`${IMG}/individual/appetite-suppressant.webp`], status: "published", featured: true,
    review: "Four prices supplied: 1 Month ₦20,000 and 2 Weeks ₦10,000 (list A); Small ₦12,000 and Big ₦22,000 (list B). Confirm which options to sell and the pouch size for each.",
    variants: [
      { label: "2 Weeks", duration: "2 weeks", price: 10000, source: A, flag: true },
      { label: "1 Month", duration: "1 month", price: 20000, source: A, flag: true },
      { label: "Small", size: "Small", price: 12000, source: B, flag: true },
      { label: "Big", size: "Big", price: 22000, source: B, flag: true },
    ],
  },
  {
    slug: "metabolic-reset", name: "Metabolic Reset", type: "single", category: "individual",
    short: "WellnessXpress Metabolic Reset in a screw-cap bottle.",
    description: "Metabolic Reset from WellnessXpress, supplied in a white screw-cap bottle with the WellnessXpress label.",
    images: [`${IMG}/individual/metabolic-reset.webp`], status: "published", featured: true,
    review: "Three prices supplied: 2 Weeks ₦10,000 (list A); Small ₦12,000 and Big ₦22,000 (list B). Confirm which options to sell and the bottle size for each.",
    variants: [
      { label: "2 Weeks", duration: "2 weeks", price: 10000, source: A, flag: true },
      { label: "Small", size: "Small", price: 12000, source: B, flag: true },
      { label: "Big", size: "Big", price: 22000, source: B, flag: true },
    ],
  },
  {
    slug: "detox-seed", name: "Detox Seed", type: "single", category: "individual",
    short: "Included in the Tummy Set.",
    description: "Detox Seed is part of the Tummy Set.",
    images: [], status: "pending_confirmation",
    review: "No individual price, size or photograph supplied. Kept off the shop until details are confirmed.",
    variants: [],
  },
  {
    slug: "2-weeks-combo-set", name: "2 Weeks Combo Set", type: "combo", category: "combos",
    short: "Appetite Suppressant, Metabolic Reset and Tummy Balance.",
    description: "The 2 Weeks Combo Set contains Appetite Suppressant, Metabolic Reset and Tummy Balance.",
    images: [`${IMG}/combos/2-weeks-combo-set.webp`], status: "published", featured: true,
    review: "₦30,000 from list A. Confirm the size and quantity of each item, and whether this replaces the Mini Combo Set (₦32,500, list B).",
    variants: [{ label: "Set", duration: "2 weeks", price: 30000, source: A, flag: true }],
    items: [{ slug: "appetite-suppressant", name: "Appetite Suppressant" }, { slug: "metabolic-reset", name: "Metabolic Reset" }, { slug: "tummy-balance", name: "Tummy Balance" }],
  },
  {
    slug: "1-month-combo-set", name: "1 Month Combo Set", type: "combo", category: "combos",
    short: "Appetite Suppressant, Metabolic Reset and Tummy Balance.",
    description: "The 1 Month Combo Set contains Appetite Suppressant, Metabolic Reset and Tummy Balance.",
    images: [`${IMG}/combos/1-month-combo-set.webp`], status: "published", featured: true,
    review: "₦58,000 from list A. Confirm the size and quantity of each item, and whether this replaces the Maxi Combo Set (₦60,000, list B).",
    variants: [{ label: "Set", duration: "1 month", price: 58000, source: A, flag: true }],
    items: [{ slug: "appetite-suppressant", name: "Appetite Suppressant" }, { slug: "metabolic-reset", name: "Metabolic Reset" }, { slug: "tummy-balance", name: "Tummy Balance" }],
  },
  {
    slug: "mini-combo-set", name: "Mini Combo Set", type: "combo", category: "combos",
    short: "Appetite Suppressant, Metabolic Reset and Tummy Balance in the mini sizes.",
    description: "The Mini Combo Set contains Appetite Suppressant, Metabolic Reset and Tummy Balance. It holds the same three products as the Maxi Combo Set in smaller sizes.",
    images: [`${IMG}/combos/mini-combo-set.webp`], status: "published", featured: true,
    review: "₦32,500 from list B. Confirm the exact size of each item in the Mini set.",
    variants: [{ label: "Set", size: "Mini", price: 32500, source: B, flag: true }],
    items: [{ slug: "appetite-suppressant", name: "Appetite Suppressant", size: "Mini set size" }, { slug: "metabolic-reset", name: "Metabolic Reset", size: "Mini set size" }, { slug: "tummy-balance", name: "Tummy Balance", size: "Mini set size" }],
  },
  {
    slug: "maxi-combo-set", name: "Maxi Combo Set", type: "combo", category: "combos",
    short: "Appetite Suppressant, Metabolic Reset and Tummy Balance in the maxi sizes.",
    description: "The Maxi Combo Set contains Appetite Suppressant, Metabolic Reset and Tummy Balance. It holds the same three products as the Mini Combo Set in larger sizes.",
    images: [`${IMG}/combos/maxi-combo-set.webp`], status: "published", featured: true,
    review: "₦60,000 from list B. Confirm the exact size of each item in the Maxi set.",
    variants: [{ label: "Set", size: "Maxi", price: 60000, source: B, flag: true }],
    items: [{ slug: "appetite-suppressant", name: "Appetite Suppressant", size: "Maxi set size" }, { slug: "metabolic-reset", name: "Metabolic Reset", size: "Maxi set size" }, { slug: "tummy-balance", name: "Tummy Balance", size: "Maxi set size" }],
  },
  {
    slug: "tummy-set", name: "Tummy Set", type: "combo", category: "combos",
    short: "Tummy Balance (Big) and Detox Seed.",
    description: "The Tummy Set contains Tummy Balance (Big) and Detox Seed.",
    images: [`${IMG}/combos/tummy-set.webp`], status: "published", featured: true,
    review: "₦25,500 from list B. The Detox Seed artwork is an edited visual reference; confirm it matches the actual package before treating the packaging as final.",
    variants: [{ label: "Set", price: 25500, source: B }],
    items: [{ slug: "tummy-balance", name: "Tummy Balance", size: "Big" }, { slug: "detox-seed", name: "Detox Seed" }],
  },
  {
    slug: "1-month-full-kit", name: "1 Month Full Kit", type: "combo", category: "combos",
    short: "Appetite Suppressant, Tummy Balance, Metabolic Reset, Get Snatched Oil and Trim Down Coffee.",
    description: "The 1 Month Full Kit contains Appetite Suppressant, Tummy Balance, Metabolic Reset, Get Snatched Oil and Trim Down Coffee.",
    images: [`${IMG}/combos/1-month-full-kit.webp`], status: "published", featured: true,
    review: "₦83,500 from list A. Confirm the size and quantity of each item.",
    variants: [{ label: "Kit", duration: "1 month", price: 83500, source: A }],
    items: [
      { slug: "appetite-suppressant", name: "Appetite Suppressant" }, { slug: "tummy-balance", name: "Tummy Balance" },
      { slug: "metabolic-reset", name: "Metabolic Reset" }, { slug: "get-snatched-oil", name: "Get Snatched Oil" }, { slug: "trim-down-coffee", name: "Trim Down Coffee" },
    ],
  },
];

const skuOf = (slug: string, label: string) => ("WX-" + slug + "-" + label.replace(/[^a-z0-9]/gi, "")).toUpperCase();

export function seedCatalogue(db: DB) {
  const ins = db.prepare(
    `INSERT INTO products (slug,name,type,category,short_description,description,ingredients,images,status,featured,sort,review_note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const insV = db.prepare(
    `INSERT INTO variants (product_id,label,size,duration,sku,price,status,needs_confirmation,price_source,sort) VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  const ids: Record<string, number> = {};
  catalogue.forEach((p, i) => {
    const r = ins.run(p.slug, p.name, p.type, p.category, p.short, p.description, p.ingredients || "", JSON.stringify(p.images), p.status, p.featured ? 1 : 0, i, p.review || "");
    ids[p.slug] = Number(r.lastInsertRowid);
    p.variants.forEach((v, j) =>
      insV.run(ids[p.slug], v.label, v.size || "", v.duration || "", skuOf(p.slug, v.label), v.price, "active", v.flag ? 1 : 0, v.source, j)
    );
  });
  const insC = db.prepare("INSERT INTO combo_items (combo_id,item_product_id,item_name,size_note,quantity_note,sort) VALUES (?,?,?,?,?,?)");
  catalogue.forEach((p) =>
    (p.items || []).forEach((it, j) => insC.run(ids[p.slug], it.slug ? ids[it.slug] ?? null : null, it.name, it.size || "", it.qty || "", j))
  );
}

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  bank: { bank: "Ecobank", accountName: "Edith Ofili", accountNumber: "2930024274" },
  contact: { whatsapp: "2347079596063", email: "wellnessxpressglobal@gmail.com", instagram: "", facebook: "", tiktok: "" },
  announcement: "Pay by bank transfer. We process your order as soon as we confirm your payment.",
  about:
    "WellnessXpressBrand sells WellnessXpress weight-management and wellness products to customers in Nigeria.\n\nOur range includes Trim Down Coffee, Get Snatched Oil, Tummy Balance, Appetite Suppressant and Metabolic Reset, sold on their own or as combo sets.\n\nYou can order on this website without creating an account. Pay by bank transfer, send us your payment confirmation, and we process your order once we confirm the payment.\n\nQuestions? Message us on WhatsApp or send us an email.",
  productNotice:
    "Read the product label before use.\nFor directions for use, message us on WhatsApp before you order.\nIf you are pregnant, breastfeeding, taking medication or have a medical condition, speak to a healthcare professional before using any supplement.",
  shippingPolicy:
    "Delivery is free to all 36 states and the FCT (Abuja). There is no delivery charge and no minimum order.\n\nYou pay only for your products, by bank transfer. We start processing your order after we confirm your product payment.\n\nOrders placed before free delivery started keep the delivery fee shown on their order page.",
  returnsPolicy:
    "If there is a problem with your order, contact us on WhatsApp or by email with your order number and a short description of the problem. We will review it and tell you the next steps.\n\nKeep your order number and payment receipt until your order has been delivered.",
  privacyPolicy:
    "We collect the details you enter at checkout: your name, phone number, WhatsApp number, email address (if you give one), delivery address and any delivery instructions. If you submit a payment confirmation, we also keep the transfer reference and the receipt you upload.\n\nWe use these details only to process, deliver and support your order. We do not sell your details.\n\nWe do not take card payments on this website and we do not store card details.\n\nTo ask about your data or to have it removed, contact us on WhatsApp or by email.",
  termsPolicy:
    "All prices are in Nigerian Naira (₦).\n\nPayment is by bank transfer to the account shown after checkout. Delivery within Nigeria is free. Your order advances only after an admin verifies your product payment in the bank account. Uploading a receipt or entering a transfer reference does not confirm payment by itself.\n\nProduct availability can change. If an item you ordered is not available, we will contact you before processing your order.",
};

export function seedSettings(db: DB) {
  const ins = db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)");
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, JSON.stringify(v));
}
