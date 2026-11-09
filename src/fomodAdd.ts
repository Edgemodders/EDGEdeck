// Adding a FOMOD mod: the one decision the extension, the MCP server and the command line share.
// prepareFomodAdd works out the family, the version, the mod to reinstall over and the saved
// choices; finishFomodAdd installs with the choices the caller settled on (saved, given or picked).
import * as path from "node:path";
import { baseName, cleanName, families, familyForDownload, familyKey, familyOf, nexusFileName, settleNewVersion, versionFrom } from "./families";
import { activeFiles, applySaved, findFomodRoot, inferChoices, installFomod, moduleConfigPath, readModuleConfig, type Applied, type FomodConfig, type FomodRecord, type StepChoice } from "./fomod";
import { downloadsFolder, keepDownload, saveMod, type Library, type ModInfo, type ModSource } from "./library";

export interface FomodAddPreset {
  /** The version the caller knows (a Nexus download's file version); it beats every other guess. */
  version?: string;
  /** The source to give the mod (a Nexus download's ids). */
  source?: ModSource;
  /** The family key the mod belongs in (a Nexus file's line). */
  family?: string;
}

export interface PreparedFomod {
  root: string;
  cfg: FomodConfig;
  text: string;
  /** The file or folder added, and whether it is a file (kept in downloads on finishing). */
  sourcePath: string;
  isFile: boolean;
  /** The name a new entry gets. */
  name: string;
  /** The mod reinstalled over: the one this download is kept for, or the family's mod of this version. */
  target?: ModInfo;
  /** The family's active mod, if the family is in the library. */
  active?: ModInfo;
  /** The family key a new entry is pinned to (from the preset). */
  family?: string;
  /** Whether the caller gave a preset: its source then refreshes a reinstalled mod's. */
  preset: boolean;
  version: string;
  source: ModSource;
  /** The record the choices came from (the target's, else the active mod's); none when nothing was saved. */
  record?: FomodRecord;
  applied: Applied;
  /** Saved choices that fit: install without asking. */
  silent: boolean;
  /** The choices were worked out from the installed files: always confirm them. */
  inferred: boolean;
  /** What it was prepared from, to prepare it again after a wait (reprepareFomodAdd). */
  input: FomodAddInput;
}

export interface FomodAddInput { source: string; folder: string; isFile: boolean; name?: string; preset?: FomodAddPreset }

export function prepareFomodAdd(lib: Library, opts: FomodAddInput): PreparedFomod {
  const { source, folder, isFile, preset } = opts;
  const root = findFomodRoot(folder);
  if (!root) throw new Error(`${path.basename(source)} has no installer (fomod/ModuleConfig.xml).`);
  const { config: cfg, text } = readModuleConfig(moduleConfigPath(root));
  const ctx = { activeFiles: activeFiles(lib) };
  const keptPath = isFile ? path.join(downloadsFolder(lib.root), path.basename(source)) : undefined;
  const download = keptPath ? familyForDownload(lib, keptPath) : undefined;
  const modName = path.basename(source, isFile ? path.extname(source) : "");
  const label = opts.name ?? (isFile ? cleanName(modName) : modName);
  const fams = families(lib);
  // A Nexus file name carries the page's id: it finds the mod even when the names differ.
  const pageId = preset?.source?.modId ?? (isFile ? nexusFileName(modName)?.modId : undefined);
  // The family: the preset's line (a new line has none yet), else the mod this download is kept for, else the Nexus page, else by name.
  const fam = preset?.family
    ? fams.find((f) => f.key === preset.family)
    : download
      ? familyOf(lib, download)
      : (pageId && fams.find((f) => f.key === `nexus:${pageId}`)) ||
        (preset?.source?.modId ? undefined : fams.find((f) => f.mods.some((m) => familyKey(m) === `name:${baseName(label)}` || baseName(m.name) === baseName(label))));
  const active = fam?.active;
  // The version: the caller's, then the one of the mod this download is kept for, then the file name's, then the active one's (a reinstall).
  const version = preset?.version || download?.version || versionFrom(modName) || active?.version || "";
  const target = download ?? (fam ? fam.mods.find((m) => m.version === version && m.enabled) ?? fam.mods.find((m) => m.version === version) : undefined);
  // Nexus data: all of it from this download's own mod; just the page from the family's active mod.
  const inherit = download?.source ?? (active?.source.modId ? ({ type: active.source.type, modId: active.source.modId } as ModSource) : pageId ? ({ type: "file", modId: pageId } as ModSource) : undefined);
  const src: ModSource = preset?.source
    ? { ...preset.source, ...(keptPath ? { path: keptPath } : {}) }
    : isFile
      ? { type: inherit?.type ?? "file", path: keptPath, ...(inherit?.modId ? { modId: inherit.modId, fileId: inherit.fileId, fileTitle: inherit.fileTitle } : {}) }
      : { type: "folder", path: source };

  const base = target ?? active;
  const record = base?.fomod;
  let applied: Applied;
  let inferred = false;
  if (record) {
    applied = applySaved(cfg, text, root, record, base!.files, ctx, base!.name);
    inferred = record.from === "inferred";
  } else if (base) {
    // Installed before EDGEdeck knew FOMOD: guess the picks from its files, and always show them.
    const guessed = inferChoices(cfg, root, lib, base);
    applied = applySaved(cfg, text, root, { choices: guessed, configHash: "", from: "inferred" }, base.files, ctx);
    inferred = true;
  } else {
    applied = applySaved(cfg, text, root, undefined, undefined, ctx);
  }
  return {
    root, cfg, text, sourcePath: source, isFile, name: label, target, active, family: preset?.family, preset: !!preset, version, source: src, record, applied,
    silent: !!record && applied.compatible && !inferred, inferred, input: opts,
  };
}

/**
 * The same add prepared again from the library as it is now: a window that waited in the queue may
 * find the family changed meanwhile (another window added this version, an update made another active).
 */
export function reprepareFomodAdd(lib: Library, p: PreparedFomod): PreparedFomod {
  return prepareFomodAdd(lib, p.input);
}

/** Installs the prepared FOMOD with these choices: over the target, or as a new version of its family. */
export function finishFomodAdd(lib: Library, p: PreparedFomod, choices: StepChoice[], opts: { from?: FomodRecord["from"]; name?: string } = {}): { mod: ModInfo; unplaced: string[]; replaced?: ModInfo; older?: ModInfo } {
  const kept = p.isFile ? keepDownload(lib, p.sourcePath) : p.sourcePath;
  const source: ModSource = p.isFile ? { ...p.source, path: kept } : p.source;
  const { mod, unplaced } = installFomod(lib, {
    name: p.target ? p.target.name : (opts.name ?? p.name), version: p.version, source, root: p.root, cfg: p.cfg, text: p.text, choices, from: opts.from ?? "edgedeck", replace: p.target,
  });
  let replaced: ModInfo | undefined;
  let older: ModInfo | undefined;
  if (p.target) {
    // Id, order, on/off and version stay; the source follows the file just added. A caller's source
    // (a Nexus download) is the newer word on every field it has; otherwise Nexus ids it lacked are filled in.
    const old = mod.source;
    if (p.preset) mod.source = { ...old, ...defined(p.source), path: p.isFile ? kept : old.path };
    else if (p.isFile) mod.source = { ...old, ...(old.modId || !p.source.modId ? {} : { type: p.source.type, modId: p.source.modId, fileId: p.source.fileId, fileTitle: p.source.fileTitle }), path: kept };
    saveMod(lib, mod);
  } else {
    if (p.family && familyKey(mod) !== p.family) {
      mod.family = p.family;
      saveMod(lib, mod);
    }
    ({ replaced, older } = settleNewVersion(lib, mod));
  }
  // The update that was waiting for review is settled once that version is in.
  const holder = p.active && p.active.id !== mod.id ? p.active : undefined;
  const pending = holder?.fomod?.pending;
  if (holder && pending && (pending.version === p.version || samePath(pending.download, kept))) {
    delete holder.fomod!.pending;
    saveMod(lib, holder);
  }
  return { mod, unplaced, replaced, older };
}

const defined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

const samePath = (a: string, b: string): boolean => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/**
 * What to do with a prepared FOMOD. "install": the saved choices fit. "hold": a quiet add (Update all)
 * that would need the window: it waits for review on `holder` (the family's active mod, else the mod
 * reinstalled over), since Update all never waits on a window. "window": ask; on Cancel the update
 * waits on `holder` when it is a download of a new version of a mod in the library. A reinstall the
 * user started (a target, not quiet) always asks: adding the same file again is how options change.
 */
export function fomodAddStep(p: Pick<PreparedFomod, "silent" | "active" | "target">, preset?: { quiet?: boolean }): { action: "install" | "hold" | "window"; holder?: ModInfo } {
  if (p.target && !preset?.quiet) return { action: "window", holder: undefined };
  if (p.silent) return { action: "install" };
  if (preset?.quiet) return { action: "hold", holder: p.active ?? p.target };
  return { action: "window", holder: preset && p.active && !p.target ? p.active : undefined };
}

/**
 * A Nexus file the library has already. A FOMOD installs again through its window only for a
 * link the user pressed (it has a key, not a quiet update) and from the kept download of that very
 * file; anything else makes the version active as before, with no download.
 */
export function sameVersionStep(o: { fomod: boolean; keptFile: boolean; key?: string; quiet: boolean }): "reinstall" | "activate" {
  return o.fomod && o.keptFile && !!o.key && !o.quiet ? "reinstall" : "activate";
}
