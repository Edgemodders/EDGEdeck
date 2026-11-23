// Installing a list of mods downloaded from EDGEmods, all or nothing (EDGEdeck#16, parts 2 and 3).
// The EDGEmods extension asks the player, signs in, resolves the requirements and downloads and
// checks the files; it then hands them here in order, requirements first. EDGEdeck installs each
// into the library, turns it on in the active loadout and never deploys. If any item fails, the
// library is put back exactly as it was before the call: the mods it added are removed, and the
// on/off states, order, names and families an install moved are restored.

import fs from "./fsx";
import * as os from "node:os";
import * as path from "node:path";
import { classify, type Placement } from "./classifier";
import { removeTemp, unpackOrCopy } from "./extract";
import { activateVersion, familyKey, settleNewVersion } from "./families";
import { findFomodRoot, type StepChoice } from "./fomod";
import { finishFomodAdd, prepareFomodAdd, type PreparedFomod } from "./fomodAdd";
import { addMod, downloadsFolder, modFolder, saveLibrary, saveMod, type Library, type ModInfo, type ModSource } from "./library";
import { readManifest } from "./deploy";

export interface InstallItem {
  /** Downloaded .zip or .7z files, already checked against their SHA-256 by the caller. */
  files: string[];
  source: "edgemods";
  /** The EDGEmods id, such as "street-cred". */
  modId: string;
  /** The release, such as "1.0.0". */
  version: string;
  /** Shown in EDGEdeck. */
  name: string;
  /** EDGEmods ids of the mods it needs, all earlier in the list. Stored, not checked yet. */
  requires: string[];
  /** For a mod with a FOMOD installer, as the CLI and MCP `add` take them; without, the installer opens. */
  fomodChoices?: StepChoice[];
  /** The option folder to use, as `add` takes it; without, EDGEdeck asks. */
  option?: string;
}

export interface InstalledItem {
  modId: string;
  /** EDGEdeck's mod id. */
  id: string;
  version: string;
}

export type InstallResult =
  | { ok: true; installed: InstalledItem[]; skipped: InstalledItem[] }
  | { ok: false; failed: { modId: string; step: string; reason: string }; undone: string[] };

/** What a mod from EDGEmods looks like to the EDGEmods extension. */
export interface EdgemodsMod {
  modId: string;
  version: string;
  id: string;
  /** On in the active loadout. */
  on: boolean;
  /** Its files are in the game (the deploy manifest names it). */
  deployed: boolean;
}

/** The questions only the player can answer; the extension asks them in VS Code, a test answers directly. */
export interface InstallHooks {
  sevenZa?: string;
  /** Which option folder to use; undefined cancels the whole call. */
  pickOption(item: InstallItem, options: { label: string }[]): Promise<string | undefined>;
  /** The FOMOD installer's choices; undefined cancels the whole call. */
  fomodWindow(item: InstallItem, p: PreparedFomod): Promise<StepChoice[] | undefined>;
  /** "Installing Street Cred 1.0.0 (1 of 2)", for a progress line. */
  progress?(text: string): void;
}

/** The family every version of an EDGEmods mod shares. */
export function edgemodsFamily(modId: string): string {
  return `edgemods:${modId}`;
}

const IdPattern = /^[a-z0-9][a-z0-9-]*$/;

/** A step's failure, with the words the player sees. */
class StepError extends Error {
  constructor(readonly step: string, message: string) {
    super(message);
  }
}

/**
 * Where an EDGEmods download is kept: by mod and version, since two mods can ship a "main.zip", and
 * numbered when two files of one release share a name.
 */
function keptPath(lib: Library, item: InstallItem, i: number): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_");
  const name = path.basename(item.files[i]);
  const shared = item.files.filter((f) => path.basename(f).toLowerCase() === name.toLowerCase()).length > 1;
  return path.join(downloadsFolder(lib.root), "edgemods", safe(item.modId), safe(item.version), shared ? `${i + 1}-${name}` : name);
}

/** Everything an install can change, to put back on failure. */
interface Snapshot {
  info: string;
  mods: Map<string, string>;
}

function takeSnapshot(lib: Library): Snapshot {
  return { info: JSON.stringify(lib.info), mods: new Map(lib.mods.map((m) => [m.id, JSON.stringify(m)])) };
}

/** Puts the library back as the snapshot had it. Returns the ids of the mods removed. */
function restore(lib: Library, snap: Snapshot, keptFiles: string[]): string[] {
  const undone: string[] = [];
  for (const mod of lib.mods.filter((m) => !snap.mods.has(m.id))) {
    try {
      fs.rmSync(modFolder(lib, mod), { recursive: true, force: true });
    } catch {
      /* a leftover folder without its place in library.json is not loaded as part of the order; best effort */
    }
    undone.push(mod.id);
  }
  lib.mods = lib.mods.filter((m) => snap.mods.has(m.id));
  for (const mod of lib.mods) {
    const before = snap.mods.get(mod.id)!;
    if (JSON.stringify(mod) === before) continue;
    const was = JSON.parse(before) as ModInfo;
    for (const k of Object.keys(mod) as (keyof ModInfo)[]) delete mod[k];
    Object.assign(mod, was);
    saveMod(lib, mod);
  }
  lib.info = JSON.parse(snap.info);
  saveLibrary(lib);
  for (const f of keptFiles) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* a kept download is only a convenience */
    }
  }
  return undone;
}

/** The checks that need nothing unpacked, so a bad list fails before anything changes. */
function checkItem(item: InstallItem, i: number): void {
  const at = `item ${i + 1}`;
  if (item?.source !== "edgemods") throw new StepError("check", `${at}: source must be "edgemods".`);
  if (typeof item.modId !== "string" || !IdPattern.test(item.modId)) throw new StepError("check", `${at}: "${item.modId}" is not an EDGEmods id (lower case, digits and -).`);
  if (typeof item.version !== "string" || !item.version.trim()) throw new StepError("check", `${item.modId} has no version.`);
  if (typeof item.name !== "string" || !item.name.trim()) throw new StepError("check", `${item.modId} has no name.`);
  if (!Array.isArray(item.files) || !item.files.length) throw new StepError("check", `${item.modId} ${item.version} has no files.`);
  for (const f of item.files) {
    if (!/\.(zip|7z)$/i.test(f)) throw new StepError("check", `${path.basename(f)} is not a .zip or .7z file.`);
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) throw new StepError("check", `${f} is not there.`);
  }
  if (item.requires !== undefined && !(Array.isArray(item.requires) && item.requires.every((r) => typeof r === "string"))) {
    throw new StepError("check", `${item.modId}: requires must be a list of EDGEmods ids.`);
  }
}

/** The version of this EDGEmods mod the library has at this release, if any. */
function sameRelease(lib: Library, item: InstallItem): ModInfo | undefined {
  return lib.mods.find((m) => familyKey(m) === edgemodsFamily(item.modId) && m.version === item.version);
}

/** Makes this version the family's active one and turns it on. */
function turnOn(lib: Library, mod: ModInfo): void {
  activateVersion(lib, mod);
  if (!mod.enabled) {
    mod.enabled = true;
    saveMod(lib, mod);
  }
}

/** Installs one item; throws a StepError. `temps` collects what to remove afterwards. */
async function installItem(lib: Library, item: InstallItem, hooks: InstallHooks, kept: string[], temps: string[]): Promise<ModInfo> {
  const source = (first: string): ModSource => ({
    type: "edgemods",
    edgemodsId: item.modId,
    path: first,
    ...(item.files.length > 1 ? { paths: item.files.map((_, i) => keptPath(lib, item, i)) } : {}),
    requires: item.requires ?? [],
  });
  // Keep the downloads first, so a FOMOD's source and every mod's kept copy point at the library's own.
  const keptFiles: string[] = [];
  for (const [i, f] of item.files.entries()) {
    const dest = keptPath(lib, item, i);
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (!fs.existsSync(dest)) kept.push(dest);
      if (path.resolve(dest).toLowerCase() !== path.resolve(f).toLowerCase()) fs.copyFileSync(f, dest);
    } catch (err) {
      throw new StepError("unpack", `${path.basename(f)} could not be copied into the library: ${(err as Error).message}`);
    }
    keptFiles.push(dest);
  }
  const folders: string[] = [];
  for (const f of keptFiles) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "edgedeck-em-"));
    temps.push(temp);
    try {
      await unpackOrCopy(f, temp, hooks.sevenZa);
    } catch (err) {
      throw new StepError("unpack", `${path.basename(f)} could not be opened: ${(err as Error).message}`);
    }
    folders.push(temp);
  }

  // A FOMOD installer decides which files go where; it has to be the mod's only file.
  const fomodAt = folders.findIndex((d) => findFomodRoot(d));
  if (fomodAt >= 0) {
    if (folders.length > 1) throw new StepError("files", `${item.name} has an installer (FOMOD) in ${path.basename(keptFiles[fomodAt])}, so it must come as that one file, not ${folders.length}.`);
    const p = prepareFomodAdd(lib, { source: keptFiles[0], folder: folders[0], isFile: true, name: item.name, preset: { version: item.version, source: source(keptFiles[0]), family: edgemodsFamily(item.modId) } });
    let choices = item.fomodChoices;
    if (choices) {
      const unknown = choices.filter((c) => !p.cfg.steps.some((st) => st.name === c.step && st.groups.some((g) => g.name === c.group)));
      if (unknown.length) throw new StepError("choice", `${item.name}'s installer has no ${unknown.map((c) => `${c.step} / ${c.group}`).join(", ")}.`);
    } else if (p.silent) {
      choices = p.applied.choices;
    } else {
      choices = await hooks.fomodWindow(item, p);
      if (!choices) throw new StepError("choice", `${item.name}'s installer was closed without installing.`);
    }
    const { mod } = finishFomodAdd(lib, p, choices, { from: item.fomodChoices || !p.silent ? "edgedeck" : p.record?.from, name: item.name });
    return mod;
  }

  const placements: Placement[] = [];
  const from = new Map<string, string>();
  for (let i = 0; i < folders.length; i++) {
    let c = classify(folders[i], item.name);
    if (c.options) {
      const label = item.option && c.options.some((o) => o.label === item.option) ? item.option : await hooks.pickOption(item, c.options);
      const pick = label && c.options.find((o) => o.label === label);
      if (!pick) throw new StepError("choice", label ? `${item.name} has no option "${label}".` : `${item.name}'s choice of options was closed.`);
      c = classify(pick.folder, item.name);
    }
    for (const p of c.placements) {
      const key = p.to.toLowerCase();
      const other = from.get(key);
      if (other !== undefined) throw new StepError("files", `${path.basename(keptFiles[i])} and ${other} both put ${p.to}.`);
      from.set(key, path.basename(keptFiles[i]));
      placements.push(p);
    }
  }
  if (!placements.length) throw new StepError("files", `Nothing in ${keptFiles.map((f) => path.basename(f)).join(", ")} looks like a Cyberpunk mod file.`);
  const mod = addMod(lib, placements, { name: item.name.trim(), version: item.version, source: source(keptFiles[0]) });
  settleNewVersion(lib, mod);
  return mod;
}

/**
 * Installs the list in order, all or nothing. A mod already in the library at that release is not
 * added again: it is listed in `skipped` (and turned on, like the rest). Does not deploy.
 */
export async function installMods(lib: Library, items: InstallItem[], hooks: InstallHooks): Promise<InstallResult> {
  const snap = takeSnapshot(lib);
  const kept: string[] = [];
  const installed: InstalledItem[] = [];
  const skipped: InstalledItem[] = [];
  let current = "";
  try {
    if (!Array.isArray(items) || !items.length) throw new StepError("check", "The list of mods to install is empty.");
    items.forEach((item, i) => {
      current = typeof item?.modId === "string" ? item.modId : "";
      checkItem(item, i);
    });
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.modId)) throw new StepError("check", `${item.modId} is in the list twice.`);
      seen.add(item.modId);
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      current = item.modId;
      const have = sameRelease(lib, item);
      if (have) {
        turnOn(lib, have);
        skipped.push({ modId: item.modId, id: have.id, version: have.version });
        continue;
      }
      hooks.progress?.(`${item.name} ${item.version}${items.length > 1 ? ` (${i + 1} of ${items.length})` : ""}`);
      const temps: string[] = [];
      try {
        const mod = await installItem(lib, item, hooks, kept, temps);
        turnOn(lib, mod);
        installed.push({ modId: item.modId, id: mod.id, version: mod.version });
      } finally {
        for (const t of temps) removeTemp(t);
      }
    }
    return { ok: true, installed, skipped };
  } catch (err) {
    const step = err instanceof StepError ? err.step : "add";
    const reason = err instanceof Error ? err.message : String(err);
    const undone = restore(lib, snap, kept);
    return { ok: false, failed: { modId: current || items?.[0]?.modId || "", step, reason }, undone };
  }
}

/** The library's mods from EDGEmods, every version, with whether each is on and in the game. */
export function edgemodsMods(lib: Library, gamePath: string): EdgemodsMod[] {
  const manifest = gamePath ? readManifest(gamePath) : undefined;
  const inGame = new Set(manifest?.files.map((f) => f.mod) ?? []);
  return lib.mods
    .filter((m) => m.source.type === "edgemods" && m.source.edgemodsId)
    .map((m) => ({ modId: m.source.edgemodsId!, version: m.version, id: m.id, on: m.enabled, deployed: inGame.has(m.id) }));
}
