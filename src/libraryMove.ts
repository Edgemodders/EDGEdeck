// Moving the library to another folder: a rename on the same drive, else a copy that is checked
// file by file before the old folder goes. The usual reason is the game's drive, where deploy can use
// hardlinks; the next deploy switches the game's files over (deployMethod in deploy.ts).

import * as fs from "node:fs";
import * as path from "node:path";

export interface MoveProgress {
  files: number;
  totalFiles: number;
  bytes: number;
  totalBytes: number;
}

export interface MoveResult {
  how: "rename" | "copy";
  files: number;
  bytes: number;
  /** Files of the old folder that could not be removed after the copy, to delete by hand. */
  leftBehind: string[];
}

/** Whether a folder holds a library: its library.json, or the mods folder a new library starts with. */
export function holdsLibrary(dir: string): boolean {
  return fs.existsSync(path.join(dir, "library.json")) || fs.existsSync(path.join(dir, "library"));
}

/** Where a library moved into the picked folder goes: the folder itself when empty, else an EDGEdeck folder in it. */
export function moveTarget(picked: string): string {
  if (!fs.existsSync(picked)) return picked;
  return fs.readdirSync(picked).length ? path.join(picked, "EDGEdeck") : picked;
}

/** The drive (volume) a path is on, from its nearest existing folder. */
function volume(p: string): number | undefined {
  let dir = path.resolve(p);
  for (;;) {
    try {
      return fs.statSync(dir).dev;
    } catch {
      const up = path.dirname(dir);
      if (up === dir) return undefined;
      dir = up;
    }
  }
}

/** Whether two folders are on the same drive, which hardlinks need. */
export function sameDrive(a: string, b: string): boolean {
  const va = volume(a);
  const vb = volume(b);
  return va !== undefined && va === vb;
}

function inside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Every file under a folder, relative, with its size. */
function listFiles(root: string): { rel: string; size: number }[] {
  const out: { rel: string; size: number }[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile()) out.push({ rel: path.relative(root, abs), size: fs.statSync(abs).size });
    }
  };
  walk(root);
  return out;
}

/**
 * Moves the library folder `from` to `to`, which must be missing or empty. Stop anything that holds
 * the folder open first (a watcher, REDbridge) and make sure the game is not running: Windows will not
 * rename a folder with open files, and the game keeps the hardlinked files open. A cancelled or failed
 * copy removes what it wrote and leaves the old folder as it was.
 */
export async function moveLibrary(from: string, to: string, progress?: (p: MoveProgress) => void, cancelled?: () => boolean): Promise<MoveResult> {
  const src = path.resolve(from);
  const dest = path.resolve(to);
  if (src.toLowerCase() === dest.toLowerCase()) throw new Error(`The library is already in ${dest}.`);
  if (inside(dest, src)) throw new Error(`${dest} is inside the library itself; pick a folder outside it.`);
  if (!holdsLibrary(src)) throw new Error(`${src} does not hold a library.`);
  const existed = fs.existsSync(dest);
  if (existed && fs.readdirSync(dest).length) throw new Error(`${dest} is not empty.`);

  if (sameDrive(src, dest)) {
    const files = listFiles(src);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (existed) fs.rmdirSync(dest);
    fs.renameSync(src, dest);
    return { how: "rename", files: files.length, bytes: files.reduce((n, f) => n + f.size, 0), leftBehind: [] };
  }

  const files = listFiles(src);
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const done: MoveProgress = { files: 0, totalFiles: files.length, bytes: 0, totalBytes };
  try {
    fs.mkdirSync(dest, { recursive: true });
    for (const f of files) {
      if (cancelled?.()) throw new Error("Cancelled: the library stays where it was.");
      const a = path.join(src, f.rel);
      const b = path.join(dest, f.rel);
      fs.mkdirSync(path.dirname(b), { recursive: true });
      await fs.promises.copyFile(a, b);
      // Keep the times: a copied deploy compares size and modified time with the library's file.
      const st = fs.statSync(a);
      fs.utimesSync(b, st.atime, st.mtime);
      if (fs.statSync(b).size !== f.size) throw new Error(`${f.rel} did not copy whole.`);
      done.files++;
      done.bytes += f.size;
      progress?.({ ...done });
    }
  } catch (err) {
    fs.rmSync(dest, { recursive: true, force: true });
    if (existed) fs.mkdirSync(dest, { recursive: true });
    throw err;
  }

  // Every file is in the new folder: the old one can go. What will not go is reported, not fatal.
  const leftBehind: string[] = [];
  for (const f of files) {
    try {
      fs.rmSync(path.join(src, f.rel), { force: true });
    } catch {
      leftBehind.push(path.join(src, f.rel));
    }
  }
  try {
    fs.rmSync(src, { recursive: true, force: true });
  } catch {
    // Folders that still hold a file left behind.
  }
  return { how: "copy", files: files.length, bytes: totalBytes, leftBehind };
}
