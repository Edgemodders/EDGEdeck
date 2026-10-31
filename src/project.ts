// REDcode and WolvenKit projects: a .cpmodproj next to source/ and packed/. The packed folder is
// laid out like the game folder, so a project's output is a mod like any other. A mod added from a
// project remembers it and is re-synced when the project is packed again.

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { classify, type Classification } from "./classifier";
import { activateVersion, baseName, familyKey, familyOf, takeFamilyName } from "./families";
import { addMod, placeAbove, saveMod, sourcePath, type Library, type ModInfo } from "./library";

export interface AddToProjectResult {
  /** Project-relative paths written. */
  copied: string[];
  /** Already in the project with the same content. */
  same: string[];
  /** In the project with different content; left alone unless `replace` named them. */
  kept: string[];
  /** Deploy paths that cannot go in as files: .archive files need extracting. */
  archives: string[];
}

/**
 * Copies a mod's loose files into a project's source/resources, under their deploy paths, so the
 * packed mod carries them at the same place. Archives are reported, not copied: their resources
 * need extracting into source/archive, which REDcode does.
 */
export function addToProject(lib: Library, mod: ModInfo, files: string[], projectFile: string, replace: Set<string> = new Set()): AddToProjectResult {
  const resources = path.join(path.dirname(projectFile), "source", "resources");
  const out: AddToProjectResult = { copied: [], same: [], kept: [], archives: [] };
  for (const f of files) {
    if (f.toLowerCase().endsWith(".archive")) {
      out.archives.push(f);
      continue;
    }
    const src = sourcePath(lib, mod, f);
    const rel = path.join("source", "resources", ...f.split("/"));
    const dest = path.join(resources, ...f.split("/"));
    if (fs.existsSync(dest)) {
      if (fs.readFileSync(dest).equals(fs.readFileSync(src))) {
        out.same.push(rel);
        continue;
      }
      if (!replace.has(f)) {
        out.kept.push(rel);
        continue;
      }
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    out.copied.push(rel);
  }
  return out;
}

/** The project a target file or folder would belong to: the first .cpmodproj in the folder, or undefined. */
export function findProjectFile(target: string): string | undefined {
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target.toLowerCase().endsWith(".cpmodproj") ? target : undefined;
  const files = fs.existsSync(target) ? fs.readdirSync(target).filter((f) => f.toLowerCase().endsWith(".cpmodproj")) : [];
  return files.length ? path.join(target, files[0]) : undefined;
}

export function projectName(projectFile: string): string {
  try {
    const xml = fs.readFileSync(projectFile, "utf8");
    const m = /<ModName>\s*([^<]+?)\s*<\//.exec(xml) ?? /<Name>\s*([^<]+?)\s*<\//.exec(xml);
    if (m) return m[1];
  } catch {
    // Fall through to the file name.
  }
  return path.basename(projectFile, path.extname(projectFile));
}

export function packedFolder(projectFile: string): string {
  return path.join(path.dirname(projectFile), "packed");
}

/** Classifies a project's packed output. Empty when the project was never packed. */
export function classifyProject(projectFile: string): Classification {
  const packed = packedFolder(projectFile);
  if (!fs.existsSync(packed)) return { placements: [], kinds: [], unplaced: [], ignored: [] };
  return classify(packed, projectName(projectFile));
}

/** The newest file time in a packed folder, and a hash of its file list, from one walk. */
function packedState(dir: string): { newest: number; list: string } {
  let newest = 0;
  const files: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else {
        newest = Math.max(newest, fs.statSync(p).mtimeMs);
        files.push(r.toLowerCase());
      }
    }
  };
  walk(dir, "");
  return { newest, list: createHash("sha1").update(files.sort().join("\n")).digest("hex").slice(0, 16) };
}

/**
 * Re-copies the packed output of every project-backed mod whose packed folder changed since the
 * library copy was made. Returns the mods that were refreshed. Deploy then relinks them.
 */
export function syncProjects(lib: Library): ModInfo[] {
  const refreshed: ModInfo[] = [];
  for (const mod of lib.mods) {
    if (mod.source.type !== "project" || !mod.source.path) continue;
    const packed = packedFolder(mod.source.path);
    if (!fs.existsSync(packed)) continue;
    const libNewest = mod.files.reduce((t, f) => {
      try {
        return Math.max(t, fs.statSync(sourcePath(lib, mod, f)).mtimeMs);
      } catch {
        return t;
      }
    }, 0);
    const state = packedState(packed);
    // A newer file, or a different list of files: a pack that only removed or renamed files counts too.
    // A mod with no list yet (added before lists were kept) gets one now and re-syncs only on later changes.
    const listChanged = mod.packedList !== undefined && mod.packedList !== state.list;
    if (state.newest <= libNewest + 1000 && !listChanged) {
      if (mod.packedList === undefined) {
        mod.packedList = state.list;
        saveMod(lib, mod);
      }
      continue;
    }
    const c = classifyProject(mod.source.path);
    if (!c.placements.length) continue;
    // Replace the library copy file by file; files the project no longer produces are removed.
    const keep = new Set<string>();
    for (const p of c.placements) {
      const dest = sourcePath(lib, mod, p.to);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(p.from, dest);
      keep.add(p.to);
    }
    for (const f of mod.files) if (!keep.has(f)) fs.rmSync(sourcePath(lib, mod, f), { force: true });
    mod.files = [...keep].sort();
    mod.kinds = c.kinds;
    mod.packedList = state.list;
    saveMod(lib, mod);
    refreshed.push(mod);
  }
  return refreshed;
}

export interface InstallProjectResult {
  mod: ModInfo;
  /** True when the project was new to the library; false when the mod that follows it was refreshed. */
  added: boolean;
  /** The mod of the same name the project went in beside, and how (see `installProject`). */
  beside?: { mod: ModInfo; how: BesideHow };
}

/** follow: the mod of the same name follows this project from now on. version: the project is another version of it. */
export type BesideHow = "follow" | "version";

/** The mod that follows this project file, if any. */
export function projectMod(lib: Library, projectFile: string): ModInfo | undefined {
  return lib.mods.find((m) => m.source.type === "project" && m.source.path?.toLowerCase() === projectFile.toLowerCase());
}

/**
 * A mod with the project's name that does not follow this project (another project folder, or a
 * download of the same mod): the active version of its family. Undefined when the project is known
 * already or no name matches. Installing beside one without asking would leave two mods fighting
 * over the same files, and the older one can win.
 */
export function sameNameMod(lib: Library, projectFile: string): ModInfo | undefined {
  if (projectMod(lib, projectFile)) return undefined;
  const name = baseName(projectName(projectFile));
  // A mod renamed in EDGEdeck still answers to its first name.
  const match = name ? lib.mods.find((m) => baseName(m.name) === name || (m.renamedFrom !== undefined && baseName(m.renamedFrom) === name)) : undefined;
  return match && familyOf(lib, match).active;
}

/** "dev", or "dev 2", "dev 3"... when the family has those already. */
function devVersion(lib: Library, family: string): string {
  const taken = new Set(lib.mods.filter((m) => familyKey(m) === family).map((m) => m.version.toLowerCase()));
  if (!taken.has("dev")) return "dev";
  let n = 2;
  while (taken.has(`dev ${n}`)) n++;
  return `dev ${n}`;
}

/**
 * What REDcode's Install does through EDGEdeck: the mod that follows this project gets the packed
 * output now, whatever the file times say, and is turned on; a project EDGEdeck does not know yet is
 * added as version "dev". Deploying is a separate step, so the caller can ask about other pending
 * changes first.
 *
 * `beside` answers the question about a mod of the same name (`sameNameMod`): follow makes that mod
 * follow this project and refreshes it; version adds the project as another version of its family,
 * on in the active version's place. Without it, a new project is a mod of its own.
 */
export function installProject(lib: Library, projectFile: string, beside?: { mod: ModInfo; how: BesideHow }): InstallProjectResult {
  const c = classifyProject(projectFile);
  if (!c.placements.length) throw new Error(`${projectName(projectFile)} has no packed output yet. Pack the project first (packed/ next to the project file).`);
  let existing = projectMod(lib, projectFile);
  if (!existing && beside?.how === "follow") {
    existing = beside.mod;
    // Its family (other versions, its section) stays where it was, whatever its source says now.
    existing.family = familyKey(existing);
    existing.source = { type: "project", path: projectFile };
  }
  if (!existing) {
    if (beside?.how === "version") {
      const family = familyKey(beside.mod);
      const previous = familyOf(lib, beside.mod);
      const mod = addMod(lib, c.placements, { name: projectName(projectFile), version: devVersion(lib, family), source: { type: "project", path: projectFile } });
      mod.family = family;
      takeFamilyName(lib, mod, previous.mods);
      placeAbove(lib, mod, previous.active);
      for (const m of previous.mods) {
        if (m.enabled) {
          m.enabled = false;
          saveMod(lib, m);
        }
      }
      saveMod(lib, mod);
      return { mod, added: true, beside };
    }
    const mod = addMod(lib, c.placements, { name: projectName(projectFile), version: "dev", source: { type: "project", path: projectFile } });
    return { mod, added: true };
  }
  const keep = new Set<string>();
  for (const p of c.placements) {
    const dest = sourcePath(lib, existing, p.to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(p.from, dest);
    keep.add(p.to);
  }
  for (const f of existing.files) if (!keep.has(f)) fs.rmSync(sourcePath(lib, existing, f), { force: true });
  existing.files = [...keep].sort();
  existing.kinds = c.kinds;
  existing.packedList = packedState(packedFolder(projectFile)).list;
  // On, in the place of whichever version of its family was on.
  activateVersion(lib, existing);
  existing.enabled = true;
  saveMod(lib, existing);
  return { mod: existing, added: false, ...(beside ? { beside } : {}) };
}
