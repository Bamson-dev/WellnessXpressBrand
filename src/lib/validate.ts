/** Trims, strips control characters and angle brackets, and limits length. Returns "" for non-strings. */
export const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f<>]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max) : "";

export const str = clean;
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;
export const isPhone = (v: string) => /^\+?[0-9\s-]{7,20}$/.test(v);

/** Detects allowed upload types from the first bytes of the file, never from the file name. */
export function sniffType(buf: Buffer): "jpg" | "png" | "webp" | "pdf" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "webp";
  if (buf.subarray(0, 5).toString() === "%PDF-") return "pdf";
  return null;
}
