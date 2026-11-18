import type { ReactNode } from "react";
export default function PolicyPage({ title, intro, text, children }: { title: string; intro?: string; text?: string; children?: ReactNode }) {
  return (
    <div className="container-x py-10 sm:py-14">
      <div className="prose-page">
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {intro ? <p className="!mt-3 text-lg text-neutral-600">{intro}</p> : null}
        {text ? text.split(/\n{2,}/).map((para, i) => <p key={i} className="whitespace-pre-line">{para}</p>) : null}
        {children}
      </div>
    </div>
  );
}
