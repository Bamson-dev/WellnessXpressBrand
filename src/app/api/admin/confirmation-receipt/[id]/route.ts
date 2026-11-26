import path from "path";
import { promises as fs } from "fs";
import { RECEIPT_DIR } from "@/lib/db";
import { confirmationsDb } from "@/lib/payment-confirmations";
import { can, currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", pdf: "application/pdf" };

/** Payment-confirmation receipts are private. Only signed-in admins with payment access can open them. */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!can(await currentAdmin(), "payments")) return new Response("Not found", { status: 404 });
  const row = confirmationsDb().prepare("SELECT receipt_path FROM payment_confirmations WHERE id = ?").get(Number(params.id));
  const name = String(row?.receipt_path || "");
  if (!/^PC\d+-[a-f0-9]{12}\.(jpg|png|pdf)$/.test(name)) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(path.join(RECEIPT_DIR, name));
    const ext = name.split(".").pop() as string;
    return new Response(buf, { headers: { "Content-Type": TYPES[ext], "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `${ext === "pdf" ? "attachment" : "inline"}; filename="${name}"` } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
