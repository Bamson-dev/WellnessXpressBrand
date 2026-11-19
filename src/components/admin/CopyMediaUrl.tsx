"use client";
import { useState } from "react";

export default function CopyMediaUrl({ src }: { src: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="text-xs font-medium text-brand-700 underline" onClick={async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${src}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }}>{copied ? "Copied" : "Copy URL"}</button>;
}
