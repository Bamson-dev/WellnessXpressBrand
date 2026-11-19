"use client";
import { useRef, useState } from "react";
import RichText from "@/components/RichText";

type Tool = "bold" | "italic" | "heading" | "bullets" | "numbers" | "link" | "table";

export default function DescriptionEditor({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [preview, setPreview] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  function apply(tool: Tool) {
    const el = area.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);
    let insert = selected;
    let cursor = start;
    if (tool === "bold") { insert = `**${selected || "bold text"}**`; cursor = start + (selected ? insert.length : 2); }
    if (tool === "italic") { insert = `*${selected || "italic text"}*`; cursor = start + (selected ? insert.length : 1); }
    if (tool === "heading") { insert = `## ${selected || "Heading"}`; cursor = start + insert.length; }
    if (tool === "bullets") { insert = (selected || "List item").split("\n").map((s) => `- ${s}`).join("\n"); cursor = start + insert.length; }
    if (tool === "numbers") { insert = (selected || "List item").split("\n").map((s, i) => `${i + 1}. ${s}`).join("\n"); cursor = start + insert.length; }
    if (tool === "link") { insert = `[${selected || "link text"}](https://)`; cursor = start + insert.length - 1; }
    if (tool === "table") { insert = "| Heading 1 | Heading 2 |\n| --- | --- |\n| Value | Value |"; cursor = start + insert.length; }
    setValue(before + insert + after);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
  }
  const buttons: { label: string; tool: Tool }[] = [
    { label: "Bold", tool: "bold" }, { label: "Italic", tool: "italic" }, { label: "Heading", tool: "heading" },
    { label: "Bullets", tool: "bullets" }, { label: "Numbered list", tool: "numbers" }, { label: "Link", tool: "link" }, { label: "Table", tool: "table" },
  ];
  return <div>
    <input type="hidden" name="description" value={value} />
    <div className="mb-2 flex flex-wrap items-center gap-1">
      {!preview ? buttons.map(({ label, tool }) => <button key={tool} type="button" onClick={() => apply(tool)} className="rounded border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">{label}</button>) : null}
      <button type="button" onClick={() => setPreview(!preview)} className="ml-auto rounded border border-brand-200 px-2 py-1 text-xs font-medium text-brand-700">{preview ? "Edit" : "Preview"}</button>
    </div>
    {preview ? <div className="min-h-36 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2"><RichText value={value} /></div>
      : <textarea ref={area} value={value} onChange={(e) => setValue(e.target.value)} rows={8} maxLength={12000} className="admin-input" aria-label="Product description" />}
    <p className="mt-1 text-xs text-neutral-500">Supports headings, paragraphs, bold, italics, lists, links, and tables. HTML is displayed as text.</p>
  </div>;
}
