// File lines: one Nexus mod page can carry several files that are mods of their own (two main
// files, Male and Female; an optional patch beside the main file). A line is one such file and its
// later versions, and each line is a family of its own. Nexus links the versions in `file_updates`
// when the author uploads one as an update of another; otherwise the file's name without its
// version tells the lines apart. A page with one line keeps the family key `nexus:<mod id>`, so
// libraries from before lines need no change; a second line gets `nexus:<mod id>:<first file id>`.

import { baseName, familyKey } from "./families";
import { saveLibrary, saveMod, type Library, type ModInfo } from "./library";
import type { NexusFile, NexusFiles } from "./nexus";

/** What the library knows of one entry's Nexus file. */
export interface LineFile {
  fileId?: number;
  title?: string;
}

export function lineFile(mod: ModInfo): LineFile {
  return { fileId: mod.source.fileId, title: mod.source.fileTitle };
}

const live = (f: NexusFile) => f.category_name !== "OLD_VERSION" && f.category_name !== "ARCHIVED";
const isMain = (f: NexusFile) => f.category_name === "MAIN" || f.is_primary;
const fileOf = (files: NexusFiles, id?: number) => (id === undefined ? undefined : files.files.find((f) => f.file_id === id));

/** The first file of an update chain: follows `file_updates` back from a file. */
export function chainRoot(files: NexusFiles, fileId: number): number {
  const seen = new Set<number>();
  let cur = fileId;
  for (;;) {
    seen.add(cur);
    const u = files.file_updates.find((x) => x.new_file_id === cur);
    if (!u || seen.has(u.old_file_id)) return cur;
    cur = u.old_file_id;
  }
}

function titleOf(files: NexusFiles, f: LineFile): string | undefined {
  const name = fileOf(files, f.fileId)?.name ?? f.title;
  return name ? baseName(name) || undefined : undefined;
}

/** Whether two files of one page are versions of one mod: one update chain, or one name without the version. */
export function sameLine(files: NexusFiles, a: LineFile, b: LineFile): boolean {
  if (a.fileId !== undefined && b.fileId !== undefined && (a.fileId === b.fileId || chainRoot(files, a.fileId) === chainRoot(files, b.fileId))) return true;
  const ta = titleOf(files, a);
  return !!ta && ta === titleOf(files, b);
}

/** A file the page no longer offers (an old version, archived, deleted), or one the library cannot name. */
function retired(files: NexusFiles, f: LineFile): boolean {
  const x = fileOf(files, f.fileId);
  return !x || !live(x);
}

/**
 * Which of the page's lines in the library a file continues, by index, or undefined for a new line.
 * Without a chain or a name in common, a main file continues the one line whose files the page no
 * longer offers: an author who uploads the next version as a new file and retires the old one.
 */
export function lineFor(files: NexusFiles, file: LineFile, lines: LineFile[][]): number | undefined {
  const direct = lines.findIndex((l) => l.some((e) => sameLine(files, e, file)));
  if (direct >= 0) return direct;
  const f = fileOf(files, file.fileId);
  if (!f || !isMain(f)) return undefined;
  const gone = lines.flatMap((l, i) => (l.every((e) => retired(files, e)) ? [i] : []));
  return gone.length === 1 ? gone[0] : undefined;
}

/**
 * The newest file of a line on the page. When the page no longer has the file and nothing names
 * it, the page's only main file that is not another line's, if there is exactly one.
 */
export function newestInLine(files: NexusFiles, file: LineFile, otherLines: LineFile[] = []): NexusFile | undefined {
  const mine = files.files.filter((f) => live(f) && sameLine(files, { fileId: f.file_id }, file));
  if (mine.length) return mine.sort((a, b) => b.uploaded_timestamp - a.uploaded_timestamp)[0];
  const mains = files.files.filter((f) => live(f) && isMain(f) && !otherLines.some((o) => sameLine(files, { fileId: f.file_id }, o)));
  return mains.length === 1 ? mains[0] : undefined;
}

/**
 * Splits one family's entries into lines, for families an older EDGEdeck put together. Entries in
 * the order they were added; returns a line number per entry, 0 for the family's own. Entries the
 * page still offers under different names or chains are different lines; a line the page no longer
 * offers stays with the family, and so does the first line the page still offers when the family's
 * own is retired (that one is its next version).
 */
export function splitLines(files: NexusFiles, entries: LineFile[]): number[] {
  const comp = entries.map((_, i) => i);
  const find = (i: number): number => (comp[i] === i ? i : (comp[i] = find(comp[i])));
  for (let i = 0; i < entries.length; i++) for (let j = 0; j < i; j++) if (sameLine(files, entries[i], entries[j])) comp[find(i)] = find(j);
  const roots = [...new Set(entries.map((_, i) => find(i)))];
  const isLive = (r: number) => entries.some((e, i) => find(i) === r && !retired(files, e));
  const line = new Map<number, number>([[roots[0], 0]]);
  let taken = isLive(roots[0]);
  let next = 1;
  for (const r of roots.slice(1)) {
    if (!isLive(r)) line.set(r, 0);
    else if (!taken) {
      line.set(r, 0);
      taken = true;
    } else line.set(r, next++);
  }
  return entries.map((_, i) => line.get(find(i))!);
}

/** A Nexus file's name without its version or a list number in front: "2. UV HQ Arms 1.1" is "UV HQ Arms". */
export function fileLabel(title: string): string {
  return title
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/[\s_-]*\bv?\d+(?:\.\d+)+[a-z0-9]*\b/gi, "")
    .trim();
}

/** A line's name: the page's name, then the file's label, unless that already starts with the page's name. */
export function lineName(page: string, title?: string): string {
  const t = fileLabel(title ?? "");
  if (!t || baseName(t) === baseName(page)) return page;
  return baseName(t).startsWith(baseName(page)) ? t : `${page}: ${t}`;
}

/** The page's entries in the library, grouped by family, in library order. */
function pageLines(lib: Library, modId: number): Map<string, ModInfo[]> {
  const out = new Map<string, ModInfo[]>();
  for (const m of lib.mods) if (m.source.modId === modId) out.set(familyKey(m), [...(out.get(familyKey(m)) ?? []), m]);
  return out;
}

/**
 * The family a file of a page belongs in: the key of the line it continues, with that line's
 * entries, or a new key when it is a file of its own (`newLine`, only when the page already has a
 * line in the library).
 */
export function lineOfFile(lib: Library, modId: number, fileId: number, files: NexusFiles): { key: string; entries: ModInfo[]; newLine: boolean } {
  const lines = [...pageLines(lib, modId)];
  if (!lines.length) return { key: `nexus:${modId}`, entries: [], newLine: false };
  const i = lineFor(files, { fileId }, lines.map(([, mods]) => mods.map(lineFile)));
  if (i !== undefined) return { key: lines[i][0], entries: lines[i][1], newLine: false };
  return { key: `nexus:${modId}:${chainRoot(files, fileId)}`, entries: [], newLine: true };
}

/** The files of the page's other lines in the library, which a line's update must not be taken from. */
export function otherLineFiles(lib: Library, mod: ModInfo): LineFile[] {
  if (!mod.source.modId) return [];
  const key = familyKey(mod);
  return lib.mods.filter((m) => m.source.modId === mod.source.modId && familyKey(m) !== key).map(lineFile);
}

/**
 * Puts right what an older EDGEdeck did with a page's files: every file of the page was one family,
 * so a second main file (or an optional one) became a "version" of the first and turned it off.
 * Each line found becomes a family of its own, named after the page and the file, in the same
 * section; on/off stays as it is. Also fills in the file's name on entries that lack it. Returns
 * the names of the mods split off.
 */
export function splitPage(lib: Library, modId: number, files: NexusFiles, pageName: string): string[] {
  const split: string[] = [];
  for (const m of lib.mods) {
    const name = m.source.modId === modId && !m.source.fileTitle ? fileOf(files, m.source.fileId)?.name : undefined;
    if (name) {
      m.source.fileTitle = name;
      saveMod(lib, m);
    }
  }
  for (const [key, mods] of pageLines(lib, modId)) {
    if (mods.length < 2) continue;
    const ordered = [...mods].sort((a, b) => a.added.localeCompare(b.added));
    const lines = splitLines(files, ordered.map(lineFile));
    const count = Math.max(...lines);
    for (let n = 1; n <= count; n++) {
      const members = ordered.filter((_, i) => lines[i] === n);
      const first = members[0];
      const newKey = `nexus:${modId}:${first.source.fileId !== undefined ? chainRoot(files, first.source.fileId) : first.id}`;
      const name = lineName(pageName, fileOf(files, first.source.fileId)?.name ?? first.source.fileTitle);
      for (const m of members) {
        m.family = newKey;
        m.name = name;
        delete m.renamedFrom;
        saveMod(lib, m);
      }
      const section = lib.info.sectionOf?.[key];
      if (section) lib.info.sectionOf![newKey] = section;
      split.push(name);
    }
  }
  if (split.length) saveLibrary(lib);
  return split;
}
