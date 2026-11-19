import "server-only";
import { db } from "@/lib/db";

export type Banner = {
  id: number; heading: string; description: string; buttonText: string; buttonUrl: string; desktopImage: string; mobileImage: string;
  imageAlt: string; placement: "hero" | "promo"; sort: number; active: boolean; startsAt: string; endsAt: string; updatedAt: string;
};
const map = (r: Record<string, unknown>): Banner => ({
  id: Number(r.id), heading: String(r.heading), description: String(r.description), buttonText: String(r.button_text), buttonUrl: String(r.button_url),
  desktopImage: String(r.desktop_image), mobileImage: String(r.mobile_image), imageAlt: String(r.image_alt), placement: r.placement === "hero" ? "hero" : "promo",
  sort: Number(r.sort), active: Number(r.active) === 1, startsAt: String(r.starts_at), endsAt: String(r.ends_at), updatedAt: String(r.updated_at),
});

export const allBanners = () => db().prepare("SELECT * FROM banners ORDER BY placement, sort, id").all().map(map);
export const getBanner = (id: number) => { const r = db().prepare("SELECT * FROM banners WHERE id = ?").get(id); return r ? map(r) : null; };

/** Banners customers see now: switched on and inside their schedule (dates are Lagos calendar days, inclusive). */
export function liveBanners(placement: "hero" | "promo", now = new Date()) {
  const today = new Date(now.getTime() + 3600_000).toISOString().slice(0, 10); // Africa/Lagos is UTC+1 all year
  return db().prepare("SELECT * FROM banners WHERE placement = ? AND active = 1 AND (starts_at = '' OR starts_at <= ?) AND (ends_at = '' OR ends_at >= ?) ORDER BY sort, id")
    .all(placement, today, today).map(map);
}

export const bannerStatus = (b: Banner, now = new Date()) => {
  const today = new Date(now.getTime() + 3600_000).toISOString().slice(0, 10);
  if (!b.active) return "Off";
  if (b.startsAt && b.startsAt > today) return `Scheduled from ${b.startsAt}`;
  if (b.endsAt && b.endsAt < today) return `Ended ${b.endsAt}`;
  return "Live";
};

/** Links may point inside the store ("/shop", "#combos") or to an https address. */
export const safeLink = (u: string) => /^\/(?!\/)[\w\-./?=&#%]*$/.test(u) || /^#[\w-]+$/.test(u) || /^https:\/\/[\w.-]+(\/[\w\-./?=&#%]*)?$/.test(u);
/** Banner images must be store images or uploads from the media library. */
export const safeImage = (u: string) => u === "" || /^\/images\/[\w\-./]+\.(webp|png|jpe?g)$/.test(u) || /^\/(media|product-images)\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(u);
