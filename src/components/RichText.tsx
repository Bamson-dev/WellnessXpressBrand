import { Fragment } from "react";

/*
 * Safe formatted text for product descriptions. No HTML is ever injected: the text is split into blocks and
 * rendered as React elements. Supported: blank-line paragraphs, "## " headings, "- " bullet lists, **bold**, *italic*.
 */
function inline(t: string) {
  const parts = t.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export default function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^[-•]\s+/.test(l.trim()))) {
          return <ul key={i} className="mt-3 list-disc space-y-1 pl-5 leading-7 text-neutral-700">{lines.map((l, k) => <li key={k}>{inline(l.trim().replace(/^[-•]\s+/, ""))}</li>)}</ul>;
        }
        if (/^#{2,3}\s+/.test(b) && lines.length === 1) return <h3 key={i} className="mt-5 text-lg font-bold">{inline(b.replace(/^#{2,3}\s+/, ""))}</h3>;
        return <p key={i} className="mt-3 whitespace-pre-line leading-7 text-neutral-700">{inline(b)}</p>;
      })}
    </div>
  );
}

export const plainText = (t: string) => t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/^#{2,3}\s+/gm, "").replace(/^[-•]\s+/gm, "").trim();
