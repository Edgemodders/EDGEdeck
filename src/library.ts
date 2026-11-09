// The mod library: one folder per mod, laid out exactly as it deploys, plus mod.json in each
// and library.json at the root. Everything EDGEdeck knows is in these files, so a person or an
// assistant can read the state without the UI.

import fs from "./fsx";
import * as os from "node:os";
import * as path from "node:path";
import type { Placement } from "./classifier";
import type { FomodRecord } from "./fomod";

/** What is inside a mod, by where its files land. A mod can be several kinds at once. */
export type ModKind = "archive" | "xl" | "redmod" | "reds" | "tweak" | "cet" | "red4ext" | "audioware" | "input" | "config" | "asi" | "framework" | "rednode" | "other";

export interface ModSource {
  /** github: a framework from its author's GitHub release (path is the release page, modId its Nexus id). */
  type: "folder" | "file" | "nexus" | "project" | "vortex" | "github";
  path?: string;
  modId?: number;
  fileId?: number;
  /** For a Nexus file: its name on the mod page ("Main File - Female"), which tells the files of one page apart. */
  fileTitle?: string;
}

/** `mod.json`, one per mod folder. */
export interface ModInfo {
  id: string;
  name: string;
  version: string;
  kinds: ModKind[];
  enabled: boolean;
  added: string;
  source: ModSource;
  /** Paths under the game folder, forward slashes, in no particular order. */
  files: string[];
  /** The family this mod belongs to, when set by hand (Keep both, Rename): overrides the key from its source and name. */
  family?: string;
  /** The name it had before the user renamed it in EDGEdeck; set only while renamed. */
  renamedFrom?: string;
  /** For a project's mod: a hash of the file list its packed folder had at the last sync, so a removed or renamed file re-syncs it too. */
  packedList?: string;
  /** What the FOMOD installer was given (choices, what it offered), so an update can reuse it. */
  fomod?: FomodRecord;
  /** What Nexus last said about this mod, when it has a mod id. */
  nexus?: { name: string; version: string; latestVersion: string; latestFileId: number; latestFileName: string; checked: string; author?: string; summary?: string };
}

/** `library.json` at the library root. */
export interface LibraryInfo {
  version: 1;
  gamePath: string;
  /** Mod ids, first wins a conflict. */
  order: string[];
  /** The user's own sections, in display order, shown between Frameworks and Mods. */
  sections?: string[];
  /** Family key to section name, for families put somewhere other than where their kinds put them. */
  sectionOf?: Record<string, string>;
  /** Nexus page group key to the family keys that were on when its box last turned them off (pageGroups.ts). */
  groupOn?: Record<string, string[]>;
  /** The loadout the mods' on/off state belongs to (loadouts.ts). */
  activeLoadout?: string;
}

export interface Library {
  root: string;
  info: LibraryInfo;
  mods: ModInfo[];
}

export function defaultLibraryPath(): string {
  return path.join(os.homedir(), "EDGEdeck");
}

export function libraryFolder(root: string): string {
  return path.join(root, "library");
}

export function downloadsFolder(root: string): string {
  return path.join(root, "downloads");
}

export function backupFolder(root: string): string {
  return path.join(root, "backup");
}

/** Work folders of replaceModFiles that a crash or a locked file left behind: never mods. */
const LeftoverFolder = /[.](new|old)-[^/]*$/;

/** Reads the library, creating an empty one if the folder is new. */
export function loadLibrary(root: string, gamePath: string): Library {
  fs.mkdirSync(libraryFolder(root), { recursive: true });
  const infoFile = path.join(root, "library.json");
  let info: LibraryInfo = { version: 1, gamePath, order: [] };
  if (fs.existsSync(infoFile)) {
    info = { ...info, ...(JSON.parse(fs.readFileSync(infoFile, "utf8")) as Partial<LibraryInfo>) };
  }
  info.gamePath = gamePath || info.gamePath;
  const mods: ModInfo[] = [];
  for (const entry of fs.readdirSync(libraryFolder(root), { withFileTypes: true })) {
    if (!entry.isDirectory() || LeftoverFolder.test(entry.name)) continue;
    const file = path.join(libraryFolder(root), entry.name, "mod.json");
    if (!fs.existsSync(file)) continue;
    try {
      const mod = JSON.parse(fs.readFileSync(file, "utf8")) as ModInfo;
      mod.files ??= [];
      mods.push(mod);
    } catch {
      // A broken mod.json is shown as missing rather than crashing the view.
    }
  }
  // The order list decides who wins a conflict; mods not in it go last, by name.
  const rank = new Map(info.order.map((id, i) => [id, i]));
  mods.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || a.name.localeCompare(b.name));
  info.order = mods.map((m) => m.id);
  return { root, info, mods };
}

export function saveLibrary(lib: Library): void {
  fs.writeFileSync(path.join(lib.root, "library.json"), JSON.stringify(lib.info, null, 2) + "\n");
}

export function saveMod(lib: Library, mod: ModInfo): void {
  fs.writeFileSync(path.join(modFolder(lib, mod), "mod.json"), JSON.stringify(mod, null, 2) + "\n");
}

export function modFolder(lib: Library, mod: ModInfo): string {
  return path.join(libraryFolder(lib.root), mod.id);
}

/** A folder-safe id from a mod name: lower case, dashes, unique within the library. */
export function idFor(lib: Library, name: string, version?: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const base = slug(name) || "mod";
  const taken = (id: string) => lib.mods.some((m) => m.id === id);
  if (!taken(base)) return base;
  // A second version of the same mod gets the version in its id, so "codeware-1-20-5" not "codeware-2".
  if (version && slug(version) && !taken(`${base}-${slug(version)}`)) return `${base}-${slug(version)}`;
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}-${n}`;
  return id;
}

export interface AddOptions {
  name: string;
  version?: string;
  source: ModSource;
  enabled?: boolean;
}

/** Copies classified files into a new mod folder, laid out exactly as they deploy. */
export function addMod(lib: Library, placements: Placement[], opts: AddOptions): ModInfo {
  if (!placements.length) throw new Error("Nothing to add: no files could be placed.");
  const id = idFor(lib, opts.name, opts.version);
  const target = path.join(libraryFolder(lib.root), id);
  fs.mkdirSync(target, { recursive: true });
  const files = new Set<string>();
  for (const p of placements) {
    const dest = path.join(target, ...p.to.split("/"));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(p.from, dest);
    files.add(p.to);
  }
  const mod: ModInfo = {
    id,
    name: opts.name,
    version: opts.version ?? "",
    kinds: [...new Set(placements.map((p) => p.kind))],
    enabled: opts.enabled ?? true,
    added: new Date().toISOString(),
    source: opts.source,
    files: [...files].sort(),
  };
  lib.mods.push(mod);
  lib.info.order.push(id);
  saveMod(lib, mod);
  saveLibrary(lib);
  return mod;
}

/**
 * Reinstall over an existing mod: builds the whole new tree beside the mod folder, then swaps it in, so a
 * failed copy leaves the mod as it was. Id, order and settings stay; files in the folder that the mod did
 * not list are carried over. Files are copied, never written through an existing (hardlinked) file.
 */
export function replaceModFiles(lib: Library, mod: ModInfo, placements: Placement[]): void {
  const dir = modFolder(lib, mod);
  const stamp = `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const fresh = `${dir}.new-${stamp}`;
  const aside = `${dir}.old-${stamp}`;
  const next: ModInfo = { ...mod };
  try {
    fs.mkdirSync(fresh, { recursive: true });
    const files = new Set<string>();
    const placed = new Set<string>(); // lower case: the library folder is case-insensitive on Windows
    for (const p of placements) {
      const dest = path.join(fresh, ...p.to.split("/"));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(p.from, dest);
      files.add(p.to);
      placed.add(p.to.toLowerCase());
    }
    // Whatever else sits in the folder (not listed in mod.files, not mod.json) stays.
    const listed = new Set(mod.files.map((f) => f.toLowerCase()));
    const carry = (sub: string): void => {
      for (const e of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
        const rel = sub ? `${sub}/${e.name}` : e.name;
        if (e.isDirectory()) carry(rel);
        else if (!listed.has(rel.toLowerCase()) && rel !== "mod.json" && !placed.has(rel.toLowerCase())) {
          fs.mkdirSync(path.dirname(path.join(fresh, ...rel.split("/"))), { recursive: true });
          fs.copyFileSync(path.join(dir, ...rel.split("/")), path.join(fresh, ...rel.split("/")));
        }
      }
    };
    if (fs.existsSync(dir)) carry("");
    next.files = [...files].sort();
    next.kinds = [...new Set(placements.map((p) => p.kind))];
    fs.writeFileSync(path.join(fresh, "mod.json"), JSON.stringify(next, null, 2) + "\n");
  } catch (e) {
    fs.rmSync(fresh, { recursive: true, force: true });
    throw e;
  }
  try {
    fs.renameSync(dir, aside);
  } catch (e) {
    fs.rmSync(fresh, { recursive: true, force: true });
    throw e;
  }
  try {
    fs.renameSync(fresh, dir);
  } catch (e) {
    fs.renameSync(aside, dir);
    fs.rmSync(fresh, { recursive: true, force: true });
    throw e;
  }
  mod.files = next.files;
  mod.kinds = next.kinds;
  // The swap is done. Dropping the old folder is best effort (a scanner may hold a file in it): its mod.json goes
  // first, and the loader skips leftover .old-/.new- folders anyway.
  try { fs.unlinkSync(path.join(aside, "mod.json")); } catch { /* leftover is skipped by the loader */ }
  try { fs.rmSync(aside, { recursive: true, force: true }); } catch { /* same */ }
}

export function removeMod(lib: Library, mod: ModInfo): void {
  fs.rmSync(modFolder(lib, mod), { recursive: true, force: true });
  lib.mods = lib.mods.filter((m) => m.id !== mod.id);
  lib.info.order = lib.info.order.filter((id) => id !== mod.id);
  saveLibrary(lib);
}

/** Moves a mod up (wins more conflicts) or down in the order. */
/** Moves a mod to directly above another, so it wins their conflicts. No-op if already above. */
export function placeAbove(lib: Library, mod: ModInfo, target: ModInfo): void {
  const order = lib.info.order.filter((id) => id !== mod.id);
  const t = order.indexOf(target.id);
  if (t < 0 || mod.id === target.id) return;
  if (lib.info.order.indexOf(mod.id) < lib.info.order.indexOf(target.id)) return;
  order.splice(t, 0, mod.id);
  lib.info.order = order;
  const rank = new Map(order.map((id, k) => [id, k]));
  lib.mods.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  saveLibrary(lib);
}

export function moveMod(lib: Library, mod: ModInfo, delta: -1 | 1): void {
  const i = lib.info.order.indexOf(mod.id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lib.info.order.length) return;
  [lib.info.order[i], lib.info.order[j]] = [lib.info.order[j], lib.info.order[i]];
  const rank = new Map(lib.info.order.map((id, k) => [id, k]));
  lib.mods.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  saveLibrary(lib);
}

/** Keeps the original archive so the mod can be re-added or inspected later. */
export function keepDownload(lib: Library, file: string): string {
  fs.mkdirSync(downloadsFolder(lib.root), { recursive: true });
  const dest = path.join(downloadsFolder(lib.root), path.basename(file));
  if (path.resolve(dest) !== path.resolve(file)) fs.copyFileSync(file, dest);
  return dest;
}

/** The library path a mod file deploys from. */
export function sourcePath(lib: Library, mod: ModInfo, rel: string): string {
  return path.join(modFolder(lib, mod), ...rel.split("/"));
}
