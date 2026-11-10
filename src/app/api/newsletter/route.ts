import { promises as fs } from "fs";
import path from "path";
import { appendRecord } from "@/lib/storage";
import { isEmail, str } from "@/lib/validate";
import { ipOf, limited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
const file = path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "newsletter.jsonl");

async function exists(email: string) {
  try {
    const text = await fs.readFile(file, "utf8");
    return text.split("\n").some((l) => {
      if (!l) return false;
      try { return String(JSON.parse(l).email || "").toLowerCase() === email; } catch { return false; }
    });
  } catch { return false; }
}

export async function POST(req: Request) {
  if (limited("nl:" + ipOf(req))) return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  const body = await req.json().catch(() => null);
  if (str(body?.company, 100)) return Response.json({ ok: true }); // honeypot: bots fill this field
  const email = str(body?.email, 254).toLowerCase();
  if (!isEmail(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (await exists(email)) return Response.json({ ok: true, duplicate: true });
  const ok = await appendRecord("newsletter.jsonl", { email });
  if (!ok) return Response.json({ error: "Could not save your signup. Try again later." }, { status: 503 });
  return Response.json({ ok: true });
}
