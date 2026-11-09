// Reads a Vortex installation, never writes to it. Vortex keeps one folder per mod in its staging
// folder, already laid out like the game folder, and names folders from Nexus
// "<name>-<modId>-<version>-<timestamp>". Its deployment manifest says which ones are deployed.

import fs from "./fsx";
import * as path from "node:path";
import { classify } from "./classifier";
import { addMod, saveMod, type Library, type ModInfo } from "./library";
import { readLevelDb } from "./leveldbRead";
import type { StepChoice } from "./fomod";

export interface VortexMod {
  folder: string;
  name: string;
  version: string;
  modId?: number;
  deployed: boolean;
  files: number;
}

/** Vortex's default staging folder for the game, in the user's AppData. */
export function vortexStagingPath(): string {
  return path.join(process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming"), "Vortex", "cyberpunk2077", "mods");
}

/** The staging folder Vortex wrote into its deployment manifest, while the game is still deployed. */
function manifestStaging(gamePath: string | undefined): string | undefined {
  if (!gamePath) return undefined;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(gamePath, "vortex.deployment.json"), "utf8")) as { stagingPath?: string };
    return m.stagingPath || undefined;
  } catch {
    return undefined;
  }
}

/** Drive roots that exist, the game's drive first. */
function driveRoots(gamePath: string | undefined): string[] {
  if (process.platform !== "win32") return [];
  const first = gamePath ? path.parse(path.resolve(gamePath)).root.toUpperCase() : "";
  const roots: string[] = first ? [first] : [];
  for (let c = 67; c <= 90; c++) {
    const r = `${String.fromCharCode(c)}:\\`;
    if (r !== first && fs.existsSync(r)) roots.push(r);
  }
  return roots;
}

/**
 * Every place Vortex's Cyberpunk mods may be, most likely first: the folder the user named, the one
 * Vortex's manifest names, Vortex's default in AppData, and the folders Vortex suggests on another
 * drive. Vortex must keep its mods on the game's drive to hardlink them, so a game outside C: often
 * means a staging folder like "E:\\Vortex Mods\\cyberpunk2077".
 */
export function vortexStagingCandidates(gamePath?: string, setting?: string): string[] {
  const list = [setting, manifestStaging(gamePath), vortexStagingPath()];
  for (const root of driveRoots(gamePath)) {
    list.push(path.join(root, "Vortex Mods", "cyberpunk2077"), path.join(root, "VortexMods", "cyberpunk2077"), path.join(root, "Vortex", "cyberpunk2077", "mods"), path.join(root, "Vortex", "mods", "cyberpunk2077"));
  }
  const seen = new Set<string>();
  return list.filter((p): p is string => !!p && !seen.has(p.toLowerCase()) && !!seen.add(p.toLowerCase()));
}

/** The first candidate that exists and holds at least one mod folder. */
export function findVortexStaging(gamePath?: string, setting?: string): string | undefined {
  for (const dir of vortexStagingCandidates(gamePath, setting)) {
    try {
      if (fs.readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory() && !e.name.startsWith("__"))) return dir;
    } catch {
      // Not there.
    }
  }
  return undefined;
}

function countFiles(dir: string): number {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
    else n++;
  }
  return n;
}

/** A readable name for a mod Vortex stored under a GUID: the folder its scripts or CET mod use, or its archive. */
export function guessName(folder: string): string | undefined {
  const sub = (...parts: string[]) => {
    const d = path.join(folder, ...parts);
    if (!fs.existsSync(d)) return undefined;
    const names = fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    return names.length === 1 ? names[0] : undefined;
  };
  const named = sub("r6", "scripts") ?? sub("bin", "x64", "plugins", "cyber_engine_tweaks", "mods") ?? sub("red4ext", "plugins") ?? sub("r6", "tweaks") ?? sub("mods");
  if (named) return named;
  const archives = path.join(folder, "archive", "pc", "mod");
  if (fs.existsSync(archives)) {
    const a = fs.readdirSync(archives).find((f) => f.toLowerCase().endsWith(".archive"));
    if (a) return a.replace(/\.archive$/i, "").replace(/^[#!_0-9]+/, "") || a;
  }
  return undefined;
}

/**
 * Lists Vortex's mods for this game. `gamePath` is used to read which ones are deployed and to find
 * the staging folder; `staging` overrides the search (a folder the user named).
 */
export function listVortexMods(gamePath: string, staging?: string): VortexMod[] {
  const dir = findVortexStaging(gamePath, staging);
  if (!dir) return [];
  staging = dir;
  const deployed = new Set<string>();
  const manifest = path.join(gamePath, "vortex.deployment.json");
  if (fs.existsSync(manifest)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifest, "utf8")) as { files?: { source: string }[] };
      for (const f of m.files ?? []) deployed.add(f.source);
    } catch {
      // Unreadable manifest: treat every mod as not deployed.
    }
  }
  const mods: VortexMod[] = [];
  for (const entry of fs.readdirSync(staging, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("__")) continue;
    const folder = path.join(staging, entry.name);
    const files = countFiles(folder);
    if (files === 0) continue;
    if (fs.existsSync(path.join(folder, "collection.json")) && files === 1) continue;
    const m = /^(.*?)-(\d+)-([\d-]+)-(\d{10})$/.exec(entry.name);
    const guid = /^[0-9a-f]{2}_[0-9a-f]{2}_[0-9a-f]{2}_[0-9a-f-]{36}$/i.test(entry.name);
    mods.push({
      folder,
      name: (m ? m[1] : guid ? guessName(folder) ?? entry.name : entry.name).replace(/\.(zip|7z|rar)$/i, ""),
      version: m ? m[3].replace(/-/g, ".") : "",
      modId: m ? Number(m[2]) : undefined,
      deployed: deployed.has(entry.name),
      files,
    });
  }
  return mods;
}

/**
 * Names people know some mods by, keyed by Nexus mod id, for mods whose download file is named
 * otherwise (Cyber Engine Tweaks ships as "CET 1.37.1 - Scripting fixes"). Vortex keeps its display
 * names in its own database, which EDGEdeck does not read; the staging folder name carries the id.
 */
export const KnownModNames: Record<number, string> = {
  107: "Cyber Engine Tweaks",
  1511: "redscript",
  2380: "RED4ext",
  4197: "TweakXL",
  4198: "ArchiveXL",
  7780: "Codeware",
  3518: "Native Settings UI",
  4885: "Mod Settings",
  4575: "Input Loader",
  2987: "Virtual Atelier",
};

/** A Vortex mod's name for lists and search: the known name for its Nexus id, else its own. */
export function vortexDisplayName(m: VortexMod): string {
  return (m.modId && KnownModNames[m.modId]) || m.name;
}

export interface ImportResult {
  added: ModInfo[];
  skipped: { name: string; reason: string }[];
}

/** Copies Vortex's mods into the library. Vortex is not touched. */
export function importFromVortex(lib: Library, mods: VortexMod[]): ImportResult {
  const result: ImportResult = { added: [], skipped: [] };
  for (const v of mods) {
    if (lib.mods.some((m) => m.source.type === "vortex" && m.source.path === v.folder)) {
      result.skipped.push({ name: v.name, reason: "already imported" });
      continue;
    }
    const c = classify(v.folder, v.name);
    if (c.options) {
      result.skipped.push({ name: v.name, reason: `has option folders (${c.options.map((o) => o.label).join(", ")}); add it by hand` });
      continue;
    }
    if (!c.placements.length) {
      result.skipped.push({ name: v.name, reason: "no files EDGEdeck knows where to put" });
      continue;
    }
    const mod = addMod(lib, c.placements, {
      name: vortexDisplayName(v),
      version: v.version,
      enabled: v.deployed,
      source: { type: "vortex", path: v.folder, modId: v.modId },
    });
    result.added.push(mod);
  }
  return result;
}

/** What Vortex remembers of one FOMOD mod's installer choices. */
export interface VortexChoices { vortexId: string; modId?: number; version?: string; choices: StepChoice[] }

/** Vortex's state database, in the user's AppData. */
export function vortexStateDir(): string {
  return path.join(process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming"), "Vortex", "state.v2");
}

/** A stored value is JSON, and may be JSON text inside a JSON string. */
function parseStored(v: string | undefined): unknown {
  if (v === undefined) return undefined;
  let x: unknown;
  try { x = JSON.parse(v); } catch { return v; }
  if (typeof x === "string" && "[{".includes(x.trimStart().charAt(0)) && x.trim() !== "") {
    try { x = JSON.parse(x); } catch { /* keep the string */ }
  }
  return x;
}

/** The FOMOD choices Vortex kept per mod; reads a copy of its database, writes nothing. */
export function readVortexChoices(stateDir: string): VortexChoices[] {
  const pre = "persistent###mods###cyberpunk2077###";
  let rows: Map<string, string>;
  try {
    rows = readLevelDb(stateDir, pre);
  } catch (e) {
    throw new Error(`Could not read Vortex's data in ${stateDir}: ${(e as Error).message}`);
  }
  const optSuffix = "###attributes###installerChoices###options";
  const out: VortexChoices[] = [];
  for (const [key, raw] of rows) {
    if (!key.endsWith(optSuffix)) continue;
    const vortexId = key.slice(pre.length, key.length - optSuffix.length);
    if (!vortexId || vortexId.includes("###")) continue;
    const type = parseStored(rows.get(`${pre}${vortexId}###attributes###installerChoices###type`));
    if (type !== undefined && type !== "fomod") continue;
    const opts = parseStored(raw);
    if (!Array.isArray(opts)) continue;
    const choices: StepChoice[] = [];
    for (const step of opts as { name?: unknown; groups?: unknown }[]) {
      if (!step || typeof step.name !== "string" || !Array.isArray(step.groups)) continue;
      for (const g of step.groups as { name?: unknown; choices?: unknown }[]) {
        if (!g || typeof g.name !== "string" || !Array.isArray(g.choices)) continue;
        const plugins = (g.choices as { name?: unknown }[]).map((c) => c?.name).filter((n): n is string => typeof n === "string");
        choices.push({ step: step.name, group: g.name, plugins });
      }
    }
    const id = Number(parseStored(rows.get(`${pre}${vortexId}###attributes###modId`)));
    const ver = parseStored(rows.get(`${pre}${vortexId}###attributes###version`));
    if (!choices.length) continue;
    out.push({ vortexId, modId: Number.isFinite(id) && id > 0 ? id : undefined, version: typeof ver === "string" ? ver : undefined, choices });
  }
  return out;
}

/** The last folder name of a path, whichever slash it uses. */
function lastSegment(p: string): string {
  return p.split("\\").join("/").split("/").filter(Boolean).pop() ?? "";
}

/** Gives the library's Vortex mods the choices Vortex kept; a record made by EDGEdeck is never replaced. */
export function importVortexChoices(lib: Library, list: VortexChoices[]): { matched: { id: string; vortexId: string }[]; unmatched: string[]; skipped: string[] } {
  const matched: { id: string; vortexId: string }[] = [];
  const skipped: string[] = [];
  const used = new Set<string>();
  const byFolder = new Map(list.map((v) => [v.vortexId, v]));
  const apply = (mod: ModInfo, v: VortexChoices): void => {
    used.add(v.vortexId);
    if (mod.fomod?.from === "edgedeck") {
      skipped.push(mod.id);
      return;
    }
    // An update already waiting for review keeps waiting.
    const pending = mod.fomod?.pending;
    mod.fomod = { choices: v.choices, configHash: "", from: "vortex", ...(pending ? { pending } : {}) };
    saveMod(lib, mod);
    matched.push({ id: mod.id, vortexId: v.vortexId });
  };
  const later: ModInfo[] = [];
  // By folder name first, so the fallback only sees what no folder claimed.
  for (const mod of lib.mods.filter((m) => m.source.type === "vortex")) {
    const v = mod.source.path ? byFolder.get(lastSegment(mod.source.path)) : undefined;
    if (v && !used.has(v.vortexId)) apply(mod, v);
    else later.push(mod);
  }
  // By Nexus mod id and version, only when exactly one unclaimed entry fits: a page with several files at one version is ambiguous.
  for (const mod of later) {
    if (!mod.source.modId) continue;
    const fits = list.filter((x) => !used.has(x.vortexId) && x.modId === mod.source.modId && x.version !== undefined && x.version === mod.version);
    if (fits.length === 1) apply(mod, fits[0]);
  }
  return { matched, unmatched: list.filter((v) => !used.has(v.vortexId)).map((v) => v.vortexId), skipped };
}
