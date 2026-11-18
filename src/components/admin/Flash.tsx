export default function Flash({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p role="status" className="mb-4 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-900">{msg.slice(0, 300)}</p>;
}
