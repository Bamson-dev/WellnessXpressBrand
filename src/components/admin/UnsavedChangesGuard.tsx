"use client";
import { useEffect, useRef } from "react";

export default function UnsavedChangesGuard() {
  const dirty = useRef(false);
  useEffect(() => {
    const form = document.currentScript?.parentElement?.closest("form") || document.querySelector("form[data-unsaved-guard]");
    if (!form) return;
    const markDirty = () => { dirty.current = true; };
    const onSubmit = () => { dirty.current = false; };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    form.addEventListener("submit", onSubmit);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      form.removeEventListener("input", markDirty);
      form.removeEventListener("change", markDirty);
      form.removeEventListener("submit", onSubmit);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);
  return null;
}
