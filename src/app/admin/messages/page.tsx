import { promises as fs } from "fs";
import path from "path";
import { requirePerm } from "@/lib/auth";
import { DATA_DIR } from "@/lib/db";

export const metadata = { title: "Messages" };

export default async function Messages() {
  await requirePerm("messages");
  let rows: { at: string; name: string; email: string; phone: string; message: string }[] = [];
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "contact.jsonl"), "utf8");
    rows = raw.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse().slice(0, 200);
  } catch {}
  return (
    <div>
      <h1 className="text-2xl">Contact form messages</h1>
      <div className="mt-4 space-y-3">
        {rows.length ? rows.map((m, i) => (
          <article key={i} className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
            <p className="font-semibold">{m.name} <span className="font-normal text-neutral-500">· {m.phone || ""} {m.email || ""} · {m.at}</span></p>
            <p className="mt-2 whitespace-pre-line text-neutral-800">{m.message}</p>
          </article>
        )) : <p className="text-neutral-500">No messages yet.</p>}
      </div>
    </div>
  );
}
