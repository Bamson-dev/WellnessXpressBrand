"use client";
import { useEffect } from "react";

/** Warns before leaving the page when the form has unsaved edits. */
export default function UnsavedGuard({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    let dirty = false;
    const mark = () => { dirty = true; };
    const clear = () => { dirty = false; };
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    form.addEventListener("input", mark);
    form.addEventListener("submit", clear);
    window.addEventListener("beforeunload", warn);
    return () => { form.removeEventListener("input", mark); form.removeEventListener("submit", clear); window.removeEventListener("beforeunload", warn); };
  }, [formId]);
  return null;
}
