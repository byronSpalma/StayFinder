import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

// Generic helpers for reading/writing a JSON file used as a stand-in database.
export async function readJson<T>(fileName: string): Promise<T> {
  const filePath = path.join(dataDir, fileName);
  const contents = await readFile(filePath, "utf-8");
  return JSON.parse(contents) as T;
}

export async function writeJson<T>(fileName: string, data: T): Promise<void> {
  const filePath = path.join(dataDir, fileName);
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
