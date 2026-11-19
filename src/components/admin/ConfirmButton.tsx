"use client";

export default function ConfirmButton({ children, message }: { children: React.ReactNode; message: string }) {
  return <button type="submit" onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }} className="text-xs font-semibold text-red-700 underline">{children}</button>;
}
