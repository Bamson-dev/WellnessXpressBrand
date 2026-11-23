import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/*
 * Renders a guide's Markdown body as React elements. No HTML is injected.
 * Supported: "## " and "### " headings, paragraphs, "- " and "1. " lists, "> " notes, **bold** and [links](/path).
 */
export const headingId = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function inline(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((p, i) => {
    const b = /^\*\*([^*]+)\*\*$/.exec(p);
    if (b) return <strong key={i} className="font-semibold text-ink">{b[1]}</strong>;
    const a = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
    if (a) {
      const href = a[2];
      if (href.startsWith("/")) return <Link key={i} href={href} className="font-semibold text-brand-700 underline underline-offset-2">{a[1]}</Link>;
      if (/^https:\/\//.test(href)) return <a key={i} href={href} target="_blank" rel="noopener" className="font-semibold text-brand-700 underline underline-offset-2">{a[1]}</a>;
      return <Fragment key={i}>{a[1]}</Fragment>;
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export function guideHeadings(body: string) {
  return body.split("\n").filter((l) => /^##\s/.test(l)).map((l) => { const t = l.replace(/^##\s+/, "").trim(); return { id: headingId(t), text: t }; });
}

export default function GuideBody({ body }: { body: string }) {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="guide-body">
      {blocks.map((b, i) => {
        const lines = b.split("\n").map((l) => l.trim());
        if (/^##\s/.test(b) && lines.length === 1) { const t = b.replace(/^##\s+/, ""); return <h2 key={i} id={headingId(t)} className="mt-10 scroll-mt-28 text-2xl font-extrabold text-ink">{inline(t)}</h2>; }
        if (/^###\s/.test(b) && lines.length === 1) return <h3 key={i} className="mt-6 text-lg font-bold text-ink">{inline(b.replace(/^###\s+/, ""))}</h3>;
        if (lines.every((l) => /^-\s+/.test(l))) return <ul key={i} className="mt-4 list-disc space-y-2 pl-6 leading-7 text-neutral-800">{lines.map((l, k) => <li key={k}>{inline(l.replace(/^-\s+/, ""))}</li>)}</ul>;
        if (lines.every((l) => /^\d+\.\s+/.test(l))) return <ol key={i} className="mt-4 list-decimal space-y-2 pl-6 leading-7 text-neutral-800">{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\d+\.\s+/, ""))}</li>)}</ol>;
        if (lines.every((l) => /^>\s?/.test(l))) return <aside key={i} className="mt-6 rounded-xl border-l-4 border-brand-700 bg-brand-50 p-4 leading-7 text-brand-900">{inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "))}</aside>;
        return <p key={i} className="mt-4 leading-7 text-neutral-800">{inline(lines.join(" "))}</p>;
      })}
    </div>
  );
}
