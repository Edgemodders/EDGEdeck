// Whole-file work on files of any size, a megabyte at a time. Mods can be many gigabytes, and Node
// refuses to read a file over 2 GiB in one piece ("File size ... is greater than 2 GiB", a 12 GB
// Nexus download on 2026-11-10), so nothing here reads a whole file at once.

import { createHash } from "node:crypto";
import fs from "./fsx";

const Chunk = 1 << 20;

/** Whether two files hold the same bytes: the sizes first, then a megabyte at a time. False when either cannot be read. */
export function sameBytes(a: string, b: string): boolean {
  let fa: number | undefined;
  let fb: number | undefined;
  try {
    if (fs.statSync(a).size !== fs.statSync(b).size) return false;
    fa = fs.openSync(a, "r");
    fb = fs.openSync(b, "r");
    const ba = Buffer.alloc(Chunk);
    const bb = Buffer.alloc(Chunk);
    for (;;) {
      const na = fs.readSync(fa, ba, 0, Chunk, null);
      const nb = fs.readSync(fb, bb, 0, Chunk, null);
      if (na !== nb) return false;
      if (na === 0) return true;
      if (!ba.subarray(0, na).equals(bb.subarray(0, nb))) return false;
    }
  } catch {
    return false;
  } finally {
    if (fa !== undefined) fs.closeSync(fa);
    if (fb !== undefined) fs.closeSync(fb);
  }
}

/** A file's MD5 as hex, read in the background a megabyte at a time. */
export async function md5OfFile(file: string): Promise<string> {
  const hash = createHash("md5");
  for await (const chunk of fs.createReadStream(file, { highWaterMark: Chunk })) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
