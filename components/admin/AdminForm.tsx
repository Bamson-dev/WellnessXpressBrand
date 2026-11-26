"use client";
import { useEffect, useRef } from "react";

type Props = Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & { action: (f: FormData) => void | Promise<void> };
const KEY = "wx-admin-last-form";
const SNAP = "wx-admin-form-values";
type Snap = { id: string; values: [string, string | boolean][] };
/** Stable identity for a form across re-renders: the page path plus its position among the page's forms. */
const keyOf = (form: HTMLFormElement) => `${location.pathname}:${Array.from(document.querySelectorAll("form")).indexOf(form)}`;

function snapshot(form: HTMLFormElement, id: string) {
  const values: [string, string | boolean][] = [];
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    if (!el.name || el.name.startsWith("$") || ["file", "password", "hidden", "submit", "button"].includes(el.type)) continue;
    values.push([el.name + "|" + values.filter(([k]) => k.startsWith(el.name + "|")).length, el.type === "checkbox" || el.type === "radio" ? el.checked : el.value]);
  }
  try { sessionStorage.setItem(SNAP, JSON.stringify({ id, values } satisfies Snap)); } catch {}
}
function restore(form: HTMLFormElement, id: string) {
  let snap: Snap | null = null;
  try { snap = JSON.parse(sessionStorage.getItem(SNAP) || "null"); } catch {}
  if (!snap || snap.id !== id) return;
  const seen: Record<string, number> = {};
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    if (!el.name || el.name.startsWith("$") || ["file", "password", "hidden", "submit", "button"].includes(el.type)) continue;
    const key = el.name + "|" + (seen[el.name] = (seen[el.name] ?? -1) + 1);
    const hit = snap.values.find(([k]) => k === key);
    if (!hit) continue;
    if (typeof hit[1] === "boolean") el.checked = hit[1]; else el.value = hit[1];
  }
}

/**
 * Admin form that runs a server action without React 19's automatic form reset, so typed values survive a
 * validation error. Blocks double submission while the action runs, and marks the field named in ?field=
 * (set by the server on a validation error) with the error message from ?msg=.
 */
export default function AdminForm({ action, children, id, ...rest }: Props) {
  const ref = useRef<HTMLFormElement>(null);


  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const formId = keyOf(form);
    form.querySelectorAll("[data-field-error]").forEach((n) => n.remove());
    form.querySelectorAll("[aria-invalid='true']").forEach((n) => n.removeAttribute("aria-invalid"));

    // Read query parameters after mount to avoid useSearchParams' client-render bailout
    // in admin pages that otherwise fail during hydration.
    const params = new URLSearchParams(window.location.search);
    const field = params.get("field");
    let last = ""; try { last = sessionStorage.getItem(KEY) || ""; } catch {}
    if (last !== formId || params.get("err") !== "1") return;
    restore(form, formId);
    if (!field) return;
    const el = Array.from(form.elements).find((item) => (item as HTMLInputElement).name === field) as HTMLElement | undefined;
    if (!el) return;
    el.setAttribute("aria-invalid", "true");
    const p = document.createElement("p");
    p.dataset.fieldError = "1"; p.className = "err"; p.setAttribute("role", "alert");
    p.textContent = params.get("msg") || "Check this field.";
    (el.closest("label") || el).insertAdjacentElement("afterend", p);
    el.focus();
  }, []);

  return (
    <form
      {...rest}
      id={id}
      ref={ref}
      action={action}
      onSubmit={(e) => {
        const form = e.currentTarget;
        const formId = keyOf(form);
        try { sessionStorage.setItem(KEY, formId); } catch {}
        snapshot(form, formId);
      }}
    >
      {children}
    </form>
  );
}
