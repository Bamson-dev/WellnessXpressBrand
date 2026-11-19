import type { ReactNode } from "react";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return tokens.map((token, i) => {
    const key = `${keyPrefix}-${i}`;
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={key}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("*") && token.endsWith("*")) return <em key={key}>{token.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    if (link) {
      const href = link[2].trim();
      if (/^https?:\/\//i.test(href) || (/^\/(?!\/)/.test(href))) return <a key={key} href={href} className="text-brand-700 underline" target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined}>{link[1]}</a>;
    }
    return <span key={key}>{token}</span>;
  });
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((x) => x.trim());

/** Small safe Markdown subset for product copy. Raw HTML is rendered as inert text. */
export default function RichText({ value, className = "" }: { value: string; className?: string }) {
  const lines = value.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const depth = heading[1].length;
      const Tag = (`h${depth + 1}`) as "h2" | "h3" | "h4" | "h5";
      blocks.push(<Tag key={`b-${i}`} className="mt-5 font-bold text-neutral-900">{inline(heading[2], `h-${i}`)}</Tag>);
      i++; continue;
    }
    const isTable = line.startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1]);
    if (isTable) {
      const head = cells(line); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(cells(lines[i])); i++; }
      blocks.push(<div key={`t-${i}`} className="my-4 overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr>{head.map((cell, n) => <th key={n} className="border border-neutral-200 bg-neutral-50 px-3 py-2">{inline(cell, `th-${i}-${n}`)}</th>)}</tr></thead><tbody>{rows.map((row, r) => <tr key={r}>{head.map((_, n) => <td key={n} className="border border-neutral-200 px-3 py-2">{inline(row[n] || "", `td-${i}-${r}-${n}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^[-*+]\s+/.test(line)) {
      const list: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { list.push(lines[i].replace(/^\s*[-*+]\s+/, "")); i++; }
      blocks.push(<ul key={`u-${i}`} className="my-3 list-disc space-y-1 pl-6 text-neutral-700">{list.map((item, n) => <li key={n}>{inline(item, `u-${i}-${n}`)}</li>)}</ul>);
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const list: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { list.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
      blocks.push(<ol key={`o-${i}`} className="my-3 list-decimal space-y-1 pl-6 text-neutral-700">{list.map((item, n) => <li key={n}>{inline(item, `o-${i}-${n}`)}</li>)}</ol>);
      continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|[-*+]\s+|\d+[.)]\s+|\|)/.test(lines[i].trim())) { paragraph.push(lines[i].trim()); i++; }
    blocks.push(<p key={`p-${i}`} className="my-3 leading-7 text-neutral-700">{inline(paragraph.join(" "), `p-${i}`)}</p>);
  }
  return <div className={className}>{blocks}</div>;
}
