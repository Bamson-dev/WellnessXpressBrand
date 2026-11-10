import { appendRecord } from "@/lib/storage";
import { isEmail, isPhone, str } from "@/lib/validate";
import { ipOf, limited } from "@/lib/ratelimit";

export async function POST(req: Request) {
  if (limited("ct:" + ipOf(req), 5)) return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  const b = await req.json().catch(() => null);
  const name = str(b?.name, 100);
  const email = str(b?.email, 254).toLowerCase();
  const phone = str(b?.phone, 20);
  const message = str(b?.message, 2000);
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Enter your name.";
  if (!isEmail(email)) errors.email = "Enter a valid email address.";
  if (phone && !isPhone(phone)) errors.phone = "Enter a valid phone number.";
  if (message.length < 10) errors.message = "Write a message of at least 10 characters.";
  if (str(b?.website, 50)) return Response.json({ ok: true }); // honeypot
  if (Object.keys(errors).length) return Response.json({ errors }, { status: 400 });
  const ok = await appendRecord("contact.jsonl", { name, email, phone, message });
  if (!ok) return Response.json({ error: "Could not send your message. Try again later." }, { status: 503 });
  return Response.json({ ok: true });
}
