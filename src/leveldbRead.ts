// Reads a LevelDB folder (Vortex's state.v2) in plain JS, so the .vsix needs no native module.
// Every *.ldb/*.sst table and every *.log is read and the newest write per key wins; the MANIFEST
// and the level layout are not needed for that. Deletions are dropped. Never writes to the folder:
// it reads a copy, because Vortex may hold the LOCK file.

import * as os from "node:os";
import * as path from "node:path";
import fs from "./fsx";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const snappy = require("snappyjs") as { uncompress(data: Uint8Array): Uint8Array };

interface Entry {
  seq: bigint;
  deleted: boolean;
  value: Buffer;
}

const BLOCK = 32768;

/** A varint at `pos`: its value and the position after it (values past 2^53 are not needed here). */
function varint(buf: Buffer, pos: number): [number, number] {
  let result = 0;
  let mul = 1;
  for (let i = 0; i < 10; i++) {
    const b = buf[pos++];
    if (b === undefined) throw new Error("LevelDB: truncated varint");
    result += (b & 0x7f) * mul;
    if (!(b & 0x80)) return [result, pos];
    mul *= 128;
  }
  throw new Error("LevelDB: bad varint");
}

function put(map: Map<string, Entry>, key: Buffer, entry: Entry): void {
  const k = key.toString("utf8");
  const old = map.get(k);
  if (!old || entry.seq >= old.seq) map.set(k, entry);
}

/** The entries of one block: [key, value] with the restart array and shared-prefix keys undone. */
function blockEntries(block: Buffer): Array<[Buffer, Buffer]> {
  const out: Array<[Buffer, Buffer]> = [];
  if (block.length < 4) return out;
  const restarts = block.readUInt32LE(block.length - 4);
  const end = block.length - 4 - restarts * 4;
  let pos = 0;
  let key = Buffer.alloc(0);
  while (pos < end) {
    let shared: number, unshared: number, vlen: number;
    [shared, pos] = varint(block, pos);
    [unshared, pos] = varint(block, pos);
    [vlen, pos] = varint(block, pos);
    key = Buffer.concat([key.subarray(0, shared), block.subarray(pos, pos + unshared)]);
    pos += unshared;
    out.push([key, block.subarray(pos, pos + vlen)]);
    pos += vlen;
  }
  return out;
}

function readBlock(file: Buffer, offset: number, size: number): Buffer {
  const raw = file.subarray(offset, offset + size);
  const kind = file[offset + size];
  if (kind === 0) return raw;
  if (kind === 1) return Buffer.from(snappy.uncompress(raw));
  throw new Error(`LevelDB: unknown block compression ${kind}`);
}

function readTable(file: Buffer, map: Map<string, Entry>): void {
  if (file.length < 48) return;
  let pos = file.length - 48;
  let n: number;
  [, pos] = varint(file, pos); // metaindex offset
  [, pos] = varint(file, pos); // metaindex size
  let indexOffset: number, indexSize: number;
  [indexOffset, pos] = varint(file, pos);
  [indexSize, pos] = varint(file, pos);
  for (const [, handle] of blockEntries(readBlock(file, indexOffset, indexSize))) {
    let offset: number, size: number;
    [offset, n] = varint(handle, 0);
    [size] = varint(handle, n);
    for (const [ikey, value] of blockEntries(readBlock(file, offset, size))) {
      if (ikey.length < 8) continue;
      const tag = ikey.readBigUInt64LE(ikey.length - 8);
      put(map, ikey.subarray(0, ikey.length - 8), { seq: tag >> 8n, deleted: (tag & 0xffn) === 0n, value });
    }
  }
}

/** The records of a write-ahead log, with FIRST/MIDDLE/LAST fragments joined. */
function logRecords(file: Buffer): Buffer[] {
  const records: Buffer[] = [];
  let parts: Buffer[] = [];
  for (let base = 0; base < file.length; base += BLOCK) {
    const limit = Math.min(base + BLOCK, file.length);
    let pos = base;
    while (limit - pos >= 7) {
      const len = file.readUInt16LE(pos + 4);
      const type = file[pos + 6];
      pos += 7;
      if (type === 0 && len === 0) break; // zero padding to the end of the block
      if (pos + len > limit) return records; // torn write at the end
      const data = file.subarray(pos, pos + len);
      pos += len;
      if (type === 1) records.push(data);
      else if (type === 2) parts = [data];
      else if (type === 3) parts.push(data);
      else if (type === 4) {
        parts.push(data);
        records.push(Buffer.concat(parts));
        parts = [];
      }
    }
  }
  return records;
}

function readLog(file: Buffer, map: Map<string, Entry>): void {
  for (const rec of logRecords(file)) {
    if (rec.length < 12) continue;
    let seq = rec.readBigUInt64LE(0);
    const count = rec.readUInt32LE(8);
    let pos = 12;
    for (let i = 0; i < count && pos < rec.length; i++, seq++) {
      const type = rec[pos++];
      let klen: number, vlen: number;
      [klen, pos] = varint(rec, pos);
      const key = rec.subarray(pos, pos + klen);
      pos += klen;
      if (type === 1) {
        [vlen, pos] = varint(rec, pos);
        put(map, key, { seq, deleted: false, value: rec.subarray(pos, pos + vlen) });
        pos += vlen;
      } else {
        put(map, key, { seq, deleted: true, value: Buffer.alloc(0) });
      }
    }
  }
}

/**
 * Every live key of the LevelDB folder `dir` that starts with `prefix`, with its UTF-8 value, as of
 * the newest write. Reads a copy of the folder, which is removed afterwards.
 */
export function readLevelDb(dir: string, prefix: string): Map<string, string> {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "edgedeck-leveldb-"));
  try {
    const entries = new Map<string, Entry>();
    for (const name of fs.readdirSync(dir)) {
      if (!/\.(ldb|sst|log)$/i.test(name)) continue; // LOCK and the rest are not needed
      fs.copyFileSync(path.join(dir, name), path.join(copy, name));
    }
    const names = fs.readdirSync(copy);
    for (const name of names.filter((n) => /\.(ldb|sst)$/i.test(n))) readTable(fs.readFileSync(path.join(copy, name)), entries);
    for (const name of names.filter((n) => /\.log$/i.test(n))) readLog(fs.readFileSync(path.join(copy, name)), entries);
    const out = new Map<string, string>();
    for (const [k, e] of entries) if (!e.deleted && k.startsWith(prefix)) out.set(k, e.value.toString("utf8"));
    return out;
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
}
