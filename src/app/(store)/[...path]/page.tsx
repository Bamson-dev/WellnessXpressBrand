import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";
import { resolveRedirect } from "@/lib/seo";

/** Unknown paths: follow a saved redirect (301) if one exists, otherwise show the normal 404 page. */
export default async function CatchAll(props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  const path = "/" + params.path.map((p) => decodeURIComponent(p)).join("/");
  const target = resolveRedirect(path) ?? resolveRedirect(path.toLowerCase());
  if (target) {
    db().prepare("UPDATE redirects SET hits = hits + 1 WHERE from_path IN (?, ?)").run(path, path.toLowerCase());
    permanentRedirect(target);
  }
  notFound();
}
