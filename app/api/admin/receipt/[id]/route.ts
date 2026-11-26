import path from "path";
import { promises as fs } from "fs";
import { RECEIPT_DIR } from "@/lib/db";
import { can, currentAdmin } from "@/lib/auth";
import { getOrderById } from "@/lib/orders";

export const dynamic = "force-dynamic";
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

/** Payment receipts are private. Only signed-in admins can open them. */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!can(await currentAdmin(), "payments")) return new Response("Not found", { status: 404 });
  const o = getOrderById(Number(params.id));
  const name = o?.receipt_path || "";
  if (!/^[A-Z0-9-]+-[a-f0-9]{12}\.(jpg|png|webp|pdf)$/.test(name)) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(path.join(RECEIPT_DIR, name));
    const ext = name.split(".").pop() as string;
    return new Response(buf, {
      headers: { "Content-Type": TYPES[ext], "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `inline; filename="${name}"` },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
