import { promises as fs } from "fs";
import path from "path";

const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");

/** Appends one JSON record per line to a file inside DATA_DIR. Returns false if the directory is not writable. */
export async function appendRecord(file: string, record: unknown): Promise<boolean> {
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, file), JSON.stringify({ at: new Date().toISOString(), ...(record as object) }) + "\n", { mode: 0o600 });
    return true;
  } catch (e) {
    console.error("storage write failed", (e as Error).message);
    return false;
  }
}
