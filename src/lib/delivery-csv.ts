import { NIGERIAN_STATES } from "@/lib/site";

export type DeliveryCsvRow = { state: string; fee: number | null; active: boolean; estimatedDelivery: string; note: string; line: number };
export type DeliveryCsvParse = { rows: DeliveryCsvRow[]; errors: string[] };

function parseCells(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"' && value === "") quoted = true;
    else if (ch === ",") { row.push(value); value = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(value); value = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else value += ch;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

export function parseDeliveryCsv(input: string): DeliveryCsvParse {
  if (input.length > 500_000) return { rows: [], errors: ["CSV is larger than 500 KB."] };
  let cells: string[][];
  try { cells = parseCells(input.replace(/^\uFEFF/, "")); }
  catch (e) { return { rows: [], errors: [(e as Error).message] }; }
  if (cells.length < 2) return { rows: [], errors: ["Include a header row and at least one state row."] };
  const headers = cells[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const required = ["state", "fee", "active", "estimated_delivery", "note"];
  if (required.some((h) => !headers.includes(h))) return { rows: [], errors: [`CSV headers must include: ${required.join(", ")}.`] };
  const index = Object.fromEntries(required.map((h) => [h, headers.indexOf(h)]));
  const errors: string[] = [];
  const rows: DeliveryCsvRow[] = [];
  const seen = new Set<string>();
  for (let n = 1; n < cells.length; n++) {
    const row = cells[n];
    const state = row[index.state]?.trim() || "";
    const rawFee = row[index.fee]?.trim() || "";
    const rawActive = row[index.active]?.trim().toLowerCase() || "";
    const estimate = row[index.estimated_delivery]?.trim() || "";
    const note = row[index.note]?.trim() || "";
    let invalid = false;
    if (!NIGERIAN_STATES.includes(state)) { errors.push(`Line ${n + 1}: unknown Nigerian state “${state}”.`); invalid = true; }
    if (seen.has(state)) { errors.push(`Line ${n + 1}: ${state} appears more than once.`); invalid = true; }
    seen.add(state);
    let fee: number | null = null;
    if (rawFee !== "") {
      if (!/^\d+$/.test(rawFee) || Number(rawFee) > 100_000_000) { errors.push(`Line ${n + 1}: fee must be a whole number between 0 and 100,000,000, or blank.`); invalid = true; }
      else fee = Number(rawFee);
    }
    if (!["1", "0", "true", "false", "yes", "no", "on", "off"].includes(rawActive)) { errors.push(`Line ${n + 1}: active must be yes/no or true/false.`); invalid = true; }
    if (estimate.length > 80 || note.length > 120) { errors.push(`Line ${n + 1}: estimate max is 80 characters and note max is 120.`); invalid = true; }
    if (!invalid) rows.push({ state, fee, active: ["1", "true", "yes", "on"].includes(rawActive), estimatedDelivery: estimate, note, line: n + 1 });
  }
  if (rows.length === 0 && errors.length === 0) errors.push("No state rows were found.");
  return { rows, errors };
}

