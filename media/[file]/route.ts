import path from "path";
import { promises as fs } from "fs";
import { MEDIA_DIR } from "@/lib/db";

export const dynamic = "force-dynamic";
// Uploaded file names are random and never reused, so a replaced image always gets a new address.
// Browsers keep a copy for an hour. Shared caches (Cloudflare, the Next.js image optimizer) recheck every 5 minutes,
// so a deleted image stops being served within about 5 minutes instead of hours.
const IMAGE_CACHE = "public, max-age=3600, s-maxage=300";
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Serves product images uploaded through the admin dashboard. File names are random and validated. */
export async function GET(_req: Request, props: { params: Promise<{ file: string }> }) {
  const params = await props.params;
  const name = params.file;
  if (!/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(name)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const buf = await fs.readFile(path.join(MEDIA_DIR, name));
    return new Response(buf, { headers: { "Content-Type": TYPES[name.split(".")[1]], "Cache-Control": IMAGE_CACHE, "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
