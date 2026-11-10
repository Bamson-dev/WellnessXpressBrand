import { appendRecord } from "@/lib/storage";
import { isEmail, str } from "@/lib/validate";
import { ipOf, limited } from "@/lib/ratelimit";

export async function POST(req: Request) {
  if (limited("nl:" + ipOf(req))) return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  const body = await req.json().catch(() => null);
  const email = str(body?.email, 254).toLowerCase();
  if (!isEmail(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const ok = await appendRecord("newsletter.jsonl", { email });
  if (!ok) return Response.json({ error: "Could not save your subscription. Try again later." }, { status: 503 });
  return Response.json({ ok: true });
}
