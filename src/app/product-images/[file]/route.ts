import path from "path";
import { promises as fs } from "fs";
import { PRODUCT_IMG_DIR } from "@/lib/db";

export const dynamic = "force-dynamic";
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Serves product images uploaded through the media library. Only random generated names are accepted. */
export async function GET(_req: Request, props: { params: Promise<{ file: string }> }) {
  const params = await props.params;
  const name = params.file;
  if (!/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(name)) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(path.join(PRODUCT_IMG_DIR, name));
    return new Response(buf, { headers: { "Content-Type": TYPES[name.split(".")[1]], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
