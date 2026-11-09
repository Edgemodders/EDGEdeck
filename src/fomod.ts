// FOMOD: read a mod's fomod/ModuleConfig.xml into plain data. The resolver, the saved
// choices and the installer window build on these types.
import { XMLParser, XMLValidator } from "fast-xml-parser";
import path from "node:path";
import { createHash } from "node:crypto";
import * as os from "node:os";
import fs from "./fsx";
import { classify } from "./classifier";
import { addMod, modFolder, replaceModFiles, saveMod, type Library, type ModInfo, type ModSource } from "./library";

export type GroupType = "SelectExactlyOne" | "SelectAtMostOne" | "SelectAtLeastOne" | "SelectAny" | "SelectAll";
export type PluginType = "Required" | "Recommended" | "Optional" | "NotUsable" | "CouldBeUsable";

export interface FomodFile {
  source: string;
  destination: string;
  priority: number;
  folder: boolean;
}

export interface Condition {
  op: "And" | "Or";
  flags: { name: string; value: string }[];
  files: { file: string; state: "Active" | "Inactive" | "Missing" }[];
  nested: Condition[];
  met: number; // game/FOMM/FOSE version terms: always counted as met
}

export interface FomodPlugin {
  name: string;
  description: string;
  image?: string;
  files: FomodFile[];
  flags: { name: string; value: string }[];
  type: PluginType;
  typePatterns: { when: Condition; type: PluginType }[];
}

export interface FomodGroup {
  name: string;
  type: GroupType;
  plugins: FomodPlugin[];
}

export interface FomodStep {
  name: string;
  visible?: Condition;
  groups: FomodGroup[];
}

export interface FomodConfig {
  moduleName: string;
  required: FomodFile[];
  steps: FomodStep[];
  conditional: { when: Condition; files: FomodFile[] }[];
}

// Decode the file: a BOM says UTF-16 (either way round) or UTF-8; none means UTF-8.
function decode(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf.subarray(2)).swap16().toString("utf16le");
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  return buf.toString("utf8");
}

export function readModuleConfig(xmlPath: string): { config: FomodConfig; text: string } {
  const text = decode(fs.readFileSync(xmlPath));
  return { config: parseModuleConfig(text), text };
}

// Tag and attribute names are read in lower case, since mod authors mix the case.
const REPEATING = new Set([
  "installstep", "group", "plugin", "file", "folder", "flag", "flagdependency",
  "filedependency", "dependencies", "pattern", "gamedependency", "fommdependency", "fosedependency",
]);
// preserveOrder keeps the document order of mixed <file> and <folder> entries; toNode turns its
// output into plain objects (repeating elements as arrays) with the children's order in $order.
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  transformTagName: (n) => n.toLowerCase(),
  transformAttributeName: (n) => n.toLowerCase(),
});

type Node = Record<string, any>;

function toNode(items: any[], attrs?: Record<string, string>): Node {
  const out: Node = { ...attrs };
  const order: { tag: string; node: Node }[] = [];
  for (const item of items) {
    for (const tag of Object.keys(item)) {
      if (tag === ":@") continue;
      if (tag === "#text") {
        const s = String(item[tag]);
        if (s) out["#text"] = (out["#text"] ?? "") + s;
        continue;
      }
      const child = toNode(item[tag], item[":@"]);
      order.push({ tag, node: child });
      if (REPEATING.has(tag)) (out[tag] ??= []).push(child);
      else out[tag] ??= child;
    }
  }
  out.$order = order;
  return out;
}
// An empty element parses to "", a missing one to undefined.
const node = (x: unknown): Node => (x && typeof x === "object" ? (x as Node) : {});
const list = (x: unknown): Node[] => (Array.isArray(x) ? x.map(node) : []);
const str = (x: unknown): string => (typeof x === "string" ? x : x && typeof x === "object" ? String(node(x)["#text"] ?? "") : "");
const attr = (n: Node, name: string): string => (typeof n["@" + name] === "string" ? n["@" + name] : "");

const GROUP_TYPES: GroupType[] = ["SelectExactlyOne", "SelectAtMostOne", "SelectAtLeastOne", "SelectAny", "SelectAll"];
const PLUGIN_TYPES: PluginType[] = ["Required", "Recommended", "Optional", "NotUsable", "CouldBeUsable"];
const pick = <T extends string>(all: T[], value: string, fallback: T): T =>
  all.find((a) => a.toLowerCase() === value.toLowerCase()) ?? fallback;

// order="Ascending" is the FOMOD default and sorts by name; Explicit keeps the document order.
function ordered<T extends { name: string }>(items: T[], order: string): T[] {
  const o = order.toLowerCase();
  if (o === "explicit") return items;
  const sorted = [...items].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return o === "descending" ? sorted.reverse() : sorted;
}

function fileOf(n: Node, folder: boolean): FomodFile {
  const priority = parseInt(attr(n, "priority"), 10);
  return { source: attr(n, "source"), destination: attr(n, "destination"), priority: Number.isFinite(priority) ? priority : 0, folder };
}

function filesOf(x: unknown): FomodFile[] {
  const order: { tag: string; node: Node }[] = node(x).$order ?? [];
  return order.filter((c) => c.tag === "file" || c.tag === "folder").map((c) => fileOf(c.node, c.tag === "folder"));
}

function conditionOf(x: unknown): Condition {
  const n = node(x);
  const state = (s: string): "Active" | "Inactive" | "Missing" =>
    pick(["Active", "Inactive", "Missing"], s, "Active");
  return {
    op: attr(n, "operator").toLowerCase() === "or" ? "Or" : "And",
    flags: list(n.flagdependency).map((f) => ({ name: attr(f, "flag"), value: attr(f, "value") })),
    files: list(n.filedependency).map((f) => ({ file: attr(f, "file"), state: state(attr(f, "state")) })),
    nested: list(n.dependencies).map(conditionOf),
    met: list(n.gamedependency).length + list(n.fommdependency).length + list(n.fosedependency).length,
  };
}

function pluginOf(n: Node): FomodPlugin {
  const type = node(n.typedescriptor);
  const plugin: FomodPlugin = {
    name: attr(n, "name"),
    description: str(n.description),
    files: filesOf(n.files),
    flags: list(node(n.conditionflags).flag).map((f) => ({ name: attr(f, "name"), value: str(f) })),
    type: "Optional",
    typePatterns: [],
  };
  const image = attr(node(n.image), "path");
  if (image) plugin.image = image;
  if (type.type) {
    plugin.type = pick(PLUGIN_TYPES, attr(node(type.type), "name"), "Optional");
  } else if (type.dependencytype) {
    const dt = node(type.dependencytype);
    plugin.type = pick(PLUGIN_TYPES, attr(node(dt.defaulttype), "name"), "Optional");
    plugin.typePatterns = list(node(dt.patterns).pattern).map((p) => ({
      when: conditionOf(list(p.dependencies)[0]),
      type: pick(PLUGIN_TYPES, attr(node(p.type), "name"), "Optional"),
    }));
  }
  return plugin;
}

function stepOf(n: Node): FomodStep {
  const groups = node(n.optionalfilegroups);
  const step: FomodStep = {
    name: attr(n, "name"),
    groups: ordered(
      list(groups.group).map((g) => ({
        name: attr(g, "name"),
        type: pick(GROUP_TYPES, attr(g, "type"), "SelectAny"),
        plugins: ordered(list(node(g.plugins).plugin).map(pluginOf), attr(node(g.plugins), "order")),
      })),
      attr(groups, "order"),
    ),
  };
  if (n.visible !== undefined) step.visible = conditionOf(n.visible);
  return step;
}

export function parseModuleConfig(text: string): FomodConfig {
  const valid = XMLValidator.validate(text);
  if (valid !== true) throw new Error(`not a FOMOD ModuleConfig.xml: ${valid.err.msg} (line ${valid.err.line})`);
  let parsed: any[];
  try {
    parsed = parser.parse(text);
  } catch (e) {
    throw new Error(`not a FOMOD ModuleConfig.xml: ${e instanceof Error ? e.message : String(e)}`);
  }
  const root = toNode(parsed).config;
  if (!root) throw new Error("not a FOMOD ModuleConfig.xml: no <config> element");
  const install = node(root.installsteps);
  return {
    moduleName: str(root.modulename),
    required: filesOf(root.requiredinstallfiles),
    steps: ordered(list(install.installstep).map(stepOf), attr(install, "order")),
    conditional: list(node(node(root.conditionalfileinstalls).patterns).pattern).map((p) => ({
      when: conditionOf(list(p.dependencies)[0]),
      files: filesOf(p.files),
    })),
  };
}

// ---- Resolving choices into files ----

export interface StepChoice { step: string; group: string; plugins: string[] }
// activeFiles: lower-case game paths (forward slashes) of files deployed by the mods that are on.
export interface ResolveContext { activeFiles: Set<string> }
export interface Resolved {
  files: { from: string; to: string }[];
  flags: Record<string, string>;
  visibleSteps: string[];
  errors: string[];
}

const slashes = (p: string): string => p.replace(/[\\]/g, "/").replace(/^\/+|\/+$/g, "");

function holds(c: Condition, flags: Record<string, string>, ctx: ResolveContext): boolean {
  const results: boolean[] = [
    ...c.flags.map((f) => (flags[f.name] ?? "") === f.value),
    ...c.files.map((f) => (ctx.activeFiles.has(slashes(f.file).toLowerCase()) ? f.state === "Active" : f.state !== "Active")),
    ...c.nested.map((n) => holds(n, flags, ctx)),
    ...Array<boolean>(c.met).fill(true),
  ];
  if (!results.length) return true;
  return c.op === "Or" ? results.some(Boolean) : results.every(Boolean);
}

function typeOf(p: FomodPlugin, flags: Record<string, string>, ctx: ResolveContext): PluginType {
  return p.typePatterns.find((t) => holds(t.when, flags, ctx))?.type ?? p.type;
}

const isVisible = (s: FomodStep, flags: Record<string, string>, ctx: ResolveContext): boolean =>
  !s.visible || holds(s.visible, flags, ctx);

// What the installer window starts with: Required and Recommended plugins, plus a first usable
// one where the group needs a pick. Only the steps visible with those picks are listed.
export function defaultChoices(cfg: FomodConfig, ctx: ResolveContext): StepChoice[] {
  const flags: Record<string, string> = {};
  const out: StepChoice[] = [];
  for (const step of cfg.steps) {
    if (!isVisible(step, flags, ctx)) continue;
    for (const group of step.groups) {
      const typed = group.plugins.map((p) => ({ p, t: typeOf(p, flags, ctx) }));
      let chosen = group.type === "SelectAll"
        ? typed.filter((x) => x.t !== "NotUsable")
        : typed.filter((x) => x.t === "Required" || x.t === "Recommended");
      if (group.type === "SelectExactlyOne" || group.type === "SelectAtMostOne") {
        const must = typed.filter((x) => x.t === "Required");
        chosen = must.length ? must.slice(0, 1) : chosen.slice(0, 1);
        if (!chosen.length && group.type === "SelectExactlyOne") chosen = typed.filter((x) => x.t !== "NotUsable").slice(0, 1);
      } else if (group.type === "SelectAtLeastOne" && !chosen.length) {
        chosen = typed.filter((x) => x.t !== "NotUsable").slice(0, 1);
      }
      for (const x of chosen) for (const f of x.p.flags) flags[f.name] = f.value;
      out.push({ step: step.name, group: group.name, plugins: chosen.map((x) => x.p.name) });
    }
  }
  return out;
}

// Every file under root, keyed by lower-case relative path (forward slashes).
function indexFiles(root: string): Map<string, string> {
  const index = new Map<string, string>();
  const walk = (dir: string, rel: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(`${dir}/${e.name}`, r);
      else index.set(r.toLowerCase(), r);
    }
  };
  try { walk(root, ""); } catch { /* an unreadable root has no files; every source then reports missing */ }
  return index;
}

export function resolveFomod(cfg: FomodConfig, root: string, choices: StepChoice[], ctx: ResolveContext): Resolved {
  const flags: Record<string, string> = {};
  const errors: string[] = [];
  const visibleSteps: string[] = [];
  const index = indexFiles(root);
  const picked = new Map<string, { to: string; from: string; priority: number }>();

  const add = (list: FomodFile[], who: string): void => {
    for (const f of list) {
      // The XML is untrusted: a target outside the game folder is refused.
      const target = (f.destination || f.source).replace(/[\\]/g, "/");
      if (/^\/|^[A-Za-z]:/.test(target) || target.split("/").includes("..")) {
        errors.push(`${who}: "${f.destination || f.source}" points outside the game folder.`);
        continue;
      }
      const source = slashes(f.source);
      const dest = slashes(f.destination);
      const hits: { rel: string; to: string }[] = [];
      if (f.folder) {
        const prefix = source ? source.toLowerCase() + "/" : "";
        for (const [lower, rel] of index) {
          if (!lower.startsWith(prefix)) continue;
          const inside = rel.slice(prefix.length);
          hits.push({ rel, to: dest ? `${dest}/${inside}` : inside });
        }
        if (!hits.length) errors.push(`Folder "${f.source}" is not in the mod.`);
      } else {
        const rel = index.get(source.toLowerCase());
        if (!rel) { errors.push(`File "${f.source}" is not in the mod.`); continue; }
        const endsDir = /[\\/]$/.test(f.destination);
        const to = !dest ? source : endsDir ? `${dest}/${rel.split("/").pop()}` : dest;
        hits.push({ rel, to });
      }
      for (const h of hits) {
        h.to = h.to.split("/").filter((s) => s && s !== ".").join("/");
        const key = h.to.toLowerCase();
        const old = picked.get(key);
        if (!old || f.priority >= old.priority) picked.set(key, { to: h.to, from: path.join(root, ...h.rel.split("/")), priority: f.priority });
      }
    }
  };

  add(cfg.required, "Required files");
  for (const step of cfg.steps) {
    if (!isVisible(step, flags, ctx)) continue;
    visibleSteps.push(step.name);
    for (const group of step.groups) {
      const where = `Step "${step.name}", group "${group.name}"`;
      const names = choices.find((c) => c.step === step.name && c.group === group.name)?.plugins ?? [];
      const chosen: FomodPlugin[] = [];
      for (const n of names) {
        const p = group.plugins.find((x) => x.name === n);
        if (p) { if (!chosen.includes(p)) chosen.push(p); } else errors.push(`${where}: there is no option "${n}".`);
      }
      if (group.type === "SelectAll") {
        chosen.length = 0;
        chosen.push(...group.plugins);
      } else {
        if (group.type === "SelectExactlyOne" && chosen.length !== 1) errors.push(`${where}: choose exactly one option.`);
        if (group.type === "SelectAtLeastOne" && !chosen.length) errors.push(`${where}: choose at least one option.`);
        if (group.type === "SelectAtMostOne" && chosen.length > 1) errors.push(`${where}: choose at most one option.`);
        for (const p of group.plugins) {
          const t = typeOf(p, flags, ctx);
          if (t === "Required" && !chosen.includes(p)) errors.push(`${where}: "${p.name}" is required.`);
          if (t === "NotUsable" && chosen.includes(p)) errors.push(`${where}: "${p.name}" is not usable here.`);
        }
      }
      for (const p of chosen) {
        add(p.files, `${where}, "${p.name}"`);
        for (const f of p.flags) flags[f.name] = f.value;
      }
    }
  }
  for (const c of cfg.conditional) if (holds(c.when, flags, ctx)) add(c.files, "Conditional files");

  return { files: [...picked.values()].map(({ to, from }) => ({ from, to })), flags, visibleSteps, errors };
}

// ---- Saved choices across versions ----

/** The steps, groups and plugins an installer offered, so a later version can tell what is new. */
export interface StructureStep { step: string; groups: { name: string; type: GroupType; plugins: string[] }[] }

/** What a mod remembers of its installer. `pending` is the downloaded update waiting for review (on the family's active mod). */
export interface FomodRecord {
  choices: StepChoice[];
  configHash: string;
  structure?: StructureStep[];
  from: "edgedeck" | "vortex" | "inferred";
  /** The game paths the installer resolved to at install (lower case, forward slashes), before classify drops or moves any. */
  targets?: string[];
  pending?: { download: string; version: string; fileId?: number; fileTitle?: string };
}

// sha256 of the XML with whitespace runs collapsed, so re-indenting does not count as a change.
export function configHash(text: string): string {
  return createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex");
}

export function structureOf(cfg: FomodConfig): StructureStep[] {
  return cfg.steps.map((s) => ({
    step: s.name,
    groups: s.groups.map((g) => ({ name: g.name, type: g.type, plugins: g.plugins.map((p) => p.name) })),
  }));
}

export interface Warning { step: string; group?: string; plugin?: string; kind: "new" | "gone" | "required" }
export interface Applied { choices: StepChoice[]; warnings: Warning[]; compatible: boolean }

const sameFiles = (a: string[], b: string[]): boolean => {
  const norm = (l: string[]): string[] => l.map((x) => slashes(x).toLowerCase()).sort();
  const x = norm(a);
  const y = norm(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

/** Lower-case targets with forward slashes, as a record keeps them. */
export const targetsOf = (r: Resolved): string[] => r.files.map((f) => slashes(f.to).toLowerCase()).sort();

/** What the mod would hold after classify for this resolve, from a dry-run staging; undefined when it cannot tell. */
function placedFiles(resolved: Resolved, name: string): string[] | undefined {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "edgedeck-fomod-check-"));
  try {
    stageFomod(resolved, stage);
    const c = classify(stage, name);
    return c.options ? undefined : c.placements.map((p) => p.to);
  } catch {
    return undefined;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

// Carries the saved choices onto a new version of the installer. compatible is true only when
// the new version installs with them and nothing the user has not decided on has appeared; any
// doubt (no structure, unknown installed list) says false, since a wrong true changes the install silently.
// name: the mod's name, for a record without targets (the dry run classifies as the install did).
export function applySaved(
  cfg: FomodConfig, text: string, root: string, saved: FomodRecord | undefined,
  installedFiles: string[] | undefined, ctx: ResolveContext, name?: string,
): Applied {
  const defaults = defaultChoices(cfg, ctx);
  const kept = saved?.choices ?? [];
  const warnings: Warning[] = [];

  // Surviving saved picks; a group with none left takes its default.
  const choices: StepChoice[] = [];
  for (const step of cfg.steps) {
    for (const group of step.groups) {
      const old = kept.find((c) => c.step === step.name && c.group === group.name);
      const survivors = old ? old.plugins.filter((n) => group.plugins.some((p) => p.name === n)) : [];
      if (old && (survivors.length || !old.plugins.length)) {
        choices.push({ step: step.name, group: group.name, plugins: survivors });
      } else {
        const d = defaults.find((c) => c.step === step.name && c.group === group.name);
        if (d) choices.push(d);
      }
    }
  }

  // Saved picks that no longer exist.
  let lost = false;
  for (const c of kept) {
    const group = cfg.steps.find((s) => s.name === c.step)?.groups.find((g) => g.name === c.group);
    if (!group) { warnings.push({ step: c.step, group: c.group, kind: "gone" }); lost = true; continue; }
    for (const n of c.plugins) {
      if (!group.plugins.some((p) => p.name === n)) { warnings.push({ step: c.step, group: c.group, plugin: n, kind: "gone" }); lost = true; }
    }
  }

  // Things the saved structure does not know (SelectAll groups need no decision).
  let fresh = false;
  const old = saved?.structure;
  if (old) {
    for (const step of cfg.steps) {
      const os = old.find((s) => s.step === step.name);
      if (!os) {
        if (step.groups.some((g) => g.type !== "SelectAll")) { warnings.push({ step: step.name, kind: "new" }); fresh = true; }
        continue;
      }
      for (const group of step.groups) {
        const og = os.groups.find((g) => g.name === group.name);
        if (!og) {
          if (group.type !== "SelectAll") { warnings.push({ step: step.name, group: group.name, kind: "new" }); fresh = true; }
          continue;
        }
        // A changed group type changes what the old picks mean (SelectAll installs every option).
        if (og.type !== group.type) { warnings.push({ step: step.name, group: group.name, kind: "new" }); fresh = true; continue; }
        if (group.type === "SelectAll") continue;
        for (const p of group.plugins) {
          if (!og.plugins.includes(p.name)) { warnings.push({ step: step.name, group: group.name, plugin: p.name, kind: "new" }); fresh = true; }
        }
      }
    }
  }

  const resolved = resolveFomod(cfg, root, choices, ctx);
  for (const e of resolved.errors) {
    const m = /^Step "(.*)", group "(.*?)"/.exec(e);
    warnings.push(m ? { step: m[1], group: m[2], kind: "required" } : { step: "", kind: "required" });
  }

  // Steps that hide under the saved picks lose them; visible groups never decided on are new.
  if (saved) {
    for (const c of kept) {
      if (c.plugins.length && cfg.steps.some((x) => x.name === c.step) && !resolved.visibleSteps.includes(c.step)
        && !warnings.some((w) => w.kind === "gone" && w.step === c.step && w.group === c.group)) {
        warnings.push({ step: c.step, group: c.group, kind: "gone" });
        lost = true;
      }
    }
    for (const step of cfg.steps) {
      if (!resolved.visibleSteps.includes(step.name)) continue;
      for (const group of step.groups) {
        if (group.type === "SelectAll" || kept.some((c) => c.step === step.name && c.group === group.name)) continue;
        if (warnings.some((w) => w.kind === "new" && w.step === step.name && (!w.group || w.group === group.name))) continue;
        warnings.push({ step: step.name, group: group.name, kind: "new" });
        fresh = true;
      }
    }
  }

  let compatible = !!saved && !!old && !lost && !fresh && !resolved.errors.length;
  if (compatible && saved!.configHash === configHash(text)) {
    // Same installer text: a different file list means a fileDependency resolves differently now. The
    // record's own targets are compared; an older record without them compares what classify would place.
    if (saved!.targets) compatible = sameFiles(targetsOf(resolved), saved!.targets);
    else {
      const placed = installedFiles && placedFiles(resolved, name ?? cfg.moduleName);
      compatible = !!installedFiles && !!placed && sameFiles(placed, installedFiles);
    }
  }
  return { choices, warnings, compatible };
}

// The choices with an entry for every group of every visible step (empty where nothing is picked),
// and none for steps that are not visible. Saving these lets an update tell "never decided" apart.
export function completeChoices(cfg: FomodConfig, root: string, choices: StepChoice[], ctx: ResolveContext): StepChoice[] {
  const visible = resolveFomod(cfg, root, choices, ctx).visibleSteps;
  const out: StepChoice[] = [];
  for (const step of cfg.steps) {
    if (!visible.includes(step.name)) continue;
    for (const group of step.groups) {
      const had = choices.find((c) => c.step === step.name && c.group === group.name);
      out.push({ step: step.name, group: group.name, plugins: had ? [...had.plugins] : [] });
    }
  }
  return out;
}

// ---- The installer window's model ----

export interface ViewPlugin { name: string; description: string; image?: string; checked: boolean; locked: boolean; disabled: boolean; isNew: boolean }
export interface ViewStep { name: string; mark: "ok" | "warn"; groups: { name: string; type: GroupType; plugins: ViewPlugin[] }[] }

// Walks the visible steps in order with the flags the picks so far set, the way resolveFomod does,
// and hands each group its plugins' types at that point. visit may return the group's new picks.
function walkGroups(
  cfg: FomodConfig, choices: StepChoice[], ctx: ResolveContext,
  visit: (step: FomodStep, group: FomodGroup, types: PluginType[], picked: string[]) => string[] | void,
): void {
  const flags: Record<string, string> = {};
  for (const step of cfg.steps) {
    if (!isVisible(step, flags, ctx)) continue;
    for (const group of step.groups) {
      const types = group.plugins.map((p) => typeOf(p, flags, ctx));
      const had = choices.find((c) => c.step === step.name && c.group === group.name)?.plugins ?? [];
      const picked = visit(step, group, types, had) ?? had;
      const chosen = group.type === "SelectAll" ? group.plugins : group.plugins.filter((p) => picked.includes(p.name));
      for (const p of chosen) for (const f of p.flags) flags[f.name] = f.value;
    }
  }
}

/** What the window shows: the visible steps with their marks, and whether Install can run. */
export function installerView(cfg: FomodConfig, root: string, choices: StepChoice[], warnings: Warning[], ctx: ResolveContext): { steps: ViewStep[]; canInstall: boolean } {
  const resolved = resolveFomod(cfg, root, choices, ctx);
  // The errors now, not the "required" warnings passed in, say what still needs a pick: they clear as the user picks.
  const stepErrors = new Set(resolved.errors.map((e) => /^Step "(.*)", group "/.exec(e)?.[1]).filter((s): s is string => s !== undefined));
  const changed = warnings.filter((w) => w.kind !== "required");
  const steps: ViewStep[] = [];
  walkGroups(cfg, choices, ctx, (step, group, types, picked) => {
    let vs = steps.find((s) => s.name === step.name);
    if (!vs) {
      // A step with a group never decided on (one a pick just made appear, say) is new to the user.
      const unasked = step.groups.some((g) => g.type !== "SelectAll" && !choices.some((c) => c.step === step.name && c.group === g.name));
      vs = { name: step.name, mark: stepErrors.has(step.name) || unasked || changed.some((w) => w.step === step.name) ? "warn" : "ok", groups: [] };
      steps.push(vs);
    }
    const all = group.type === "SelectAll";
    vs.groups.push({
      name: group.name,
      type: group.type,
      plugins: group.plugins.map((p, i) => ({
        name: p.name,
        description: p.description.trim(),
        ...(p.image ? { image: slashes(p.image) } : {}),
        checked: all || picked.includes(p.name),
        locked: all || types[i] === "Required",
        disabled: !all && types[i] === "NotUsable",
        isNew: changed.some((w) => w.kind === "new" && w.step === step.name && w.group === group.name && w.plugin === p.name),
      })),
    });
  });
  return { steps, canInstall: resolved.errors.length === 0 };
}

/** One click on a plugin: a pick-one group takes it (at most one: drops it when it was picked), the others add or drop it. */
export function toggleChoice(cfg: FomodConfig, choices: StepChoice[], step: string, group: string, plugin: string): StepChoice[] {
  const g = cfg.steps.find((s) => s.name === step)?.groups.find((x) => x.name === group);
  if (!g || g.type === "SelectAll" || !g.plugins.some((p) => p.name === plugin)) return choices;
  const had = choices.find((c) => c.step === step && c.group === group)?.plugins ?? [];
  const on = had.includes(plugin);
  const plugins = g.type === "SelectExactlyOne" ? [plugin]
    : g.type === "SelectAtMostOne" ? (on ? [] : [plugin])
    : on ? had.filter((n) => n !== plugin) : g.plugins.map((p) => p.name).filter((n) => n === plugin || had.includes(n));
  const out = choices.filter((c) => !(c.step === step && c.group === group));
  out.push({ step, group, plugins });
  return out;
}

/** The picks with Required plugins put in and NotUsable ones taken out, at the flags of each group's place. */
export function settleChoices(cfg: FomodConfig, choices: StepChoice[], ctx: ResolveContext): StepChoice[] {
  const out = choices.map((c) => ({ ...c, plugins: [...c.plugins] }));
  walkGroups(cfg, out, ctx, (step, group, types, picked) => {
    if (group.type === "SelectAll") return;
    const required = group.plugins.filter((_, i) => types[i] === "Required").map((p) => p.name);
    let next = picked.filter((n) => types[group.plugins.findIndex((p) => p.name === n)] !== "NotUsable");
    if (group.type === "SelectExactlyOne" || group.type === "SelectAtMostOne") {
      if (required.length) next = [required[0]];
    } else {
      next = group.plugins.map((p) => p.name).filter((n) => next.includes(n) || required.includes(n));
    }
    if (next.length === picked.length && next.every((n, i) => n === picked[i])) return;
    const entry = out.find((c) => c.step === step.name && c.group === group.name);
    if (entry) entry.plugins = next;
    else out.push({ step: step.name, group: group.name, plugins: next });
    return next;
  });
  return out;
}

// ---- Installing ----

/** The folder that holds fomod/ModuleConfig.xml: the folder itself or at most 2 levels down, the shallowest, names in any case. */
export function findFomodRoot(folder: string): string | undefined {
  const has = (dir: string): boolean => {
    try {
      const f = fs.readdirSync(dir, { withFileTypes: true }).find((e) => e.isDirectory() && e.name.toLowerCase() === "fomod");
      return !!f && fs.readdirSync(path.join(dir, f.name)).some((n) => n.toLowerCase() === "moduleconfig.xml");
    } catch {
      return false;
    }
  };
  let level = [folder];
  for (let depth = 0; depth <= 2 && level.length; depth++) {
    const hit = level.find(has);
    if (hit) return hit;
    const next: string[] = [];
    for (const dir of level) {
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) next.push(path.join(dir, e.name));
      } catch { /* unreadable folder: skip */ }
    }
    level = next;
  }
  return undefined;
}

/** The path of fomod/ModuleConfig.xml under a root findFomodRoot returned (names in any case). */
export function moduleConfigPath(root: string): string {
  const dir = fs.readdirSync(root, { withFileTypes: true }).find((e) => e.isDirectory() && e.name.toLowerCase() === "fomod");
  const file = dir && fs.readdirSync(path.join(root, dir.name)).find((n) => n.toLowerCase() === "moduleconfig.xml");
  if (!dir || !file) throw new Error(`${root} has no fomod/ModuleConfig.xml`);
  return path.join(root, dir.name, file);
}

/** Copies each resolved file to stageDir/<to>. The XML is untrusted, so every target is checked again here. Returns the files skipped (symlinks). */
export function stageFomod(resolved: Resolved, stageDir: string): string[] {
  const base = path.resolve(stageDir);
  const skipped: string[] = [];
  for (const f of resolved.files) {
    const segs = f.to.split(/[\\/]/);
    if (!f.to || segs.some((s) => s.includes(":"))) throw new Error(`Refusing to install "${f.to}": not a valid target path.`);
    const dest = path.resolve(base, ...segs);
    if (!dest.startsWith(base + path.sep)) throw new Error(`Refusing to install "${f.to}": it points outside the mod folder.`);
    if (fs.lstatSync(f.from).isSymbolicLink()) { skipped.push(f.to); continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f.from, dest);
  }
  return skipped;
}

/** Lower-case game paths of the files of the mods that are on. */
export function activeFiles(lib: Library): Set<string> {
  const out = new Set<string>();
  for (const m of lib.mods) if (m.enabled) for (const f of m.files) out.add(f.toLowerCase());
  return out;
}

function sameBytes(a: string, b: string): boolean {
  try {
    if (fs.statSync(a).size !== fs.statSync(b).size) return false;
    const sha1 = (f: string): string => createHash("sha1").update(fs.readFileSync(f)).digest("hex");
    return sha1(a) === sha1(b);
  } catch {
    return false;
  }
}

/**
 * Works out which options a mod already in the library was installed with: an option counts when every
 * file it adds is in the mod with the same bytes. An option that adds no files (only sets a flag) cannot
 * be told and is left out; a pick-one group with no match gets its default.
 */
export function inferChoices(cfg: FomodConfig, root: string, lib: Library, mod: ModInfo): StepChoice[] {
  const ctx: ResolveContext = { activeFiles: activeFiles(lib) };
  const defaults = defaultChoices(cfg, ctx);
  const dir = modFolder(lib, mod);
  const baseKey = new Set(resolveFomod(cfg, root, [], ctx).files.map((f) => `${f.to.toLowerCase()}|${f.from}`));
  const choices: StepChoice[] = [];
  for (const step of cfg.steps) {
    if (!resolveFomod(cfg, root, choices, ctx).visibleSteps.includes(step.name)) continue;
    for (const group of step.groups) {
      const matches = group.plugins.filter((p) => {
        const r = resolveFomod(cfg, root, [{ step: step.name, group: group.name, plugins: [p.name] }], ctx);
        const own = r.files.filter((f) => !baseKey.has(`${f.to.toLowerCase()}|${f.from}`));
        return own.length > 0 && own.every((f) => sameBytes(f.from, path.join(dir, ...f.to.split("/"))));
      }).map((p) => p.name);
      const def = defaults.find((c) => c.step === step.name && c.group === group.name)?.plugins ?? [];
      let plugins = matches;
      if (group.type === "SelectExactlyOne" || group.type === "SelectAtMostOne") {
        plugins = matches.length ? [matches.find((n) => def.includes(n)) ?? matches[0]] : group.type === "SelectExactlyOne" ? def : [];
      } else if (group.type === "SelectAll") plugins = group.plugins.map((p) => p.name);
      else if (group.type === "SelectAtLeastOne" && !plugins.length) plugins = def;
      choices.push({ step: step.name, group: group.name, plugins });
    }
  }
  return completeChoices(cfg, root, choices, ctx);
}

export interface InstallFomodOptions {
  name: string;
  version?: string;
  source: ModSource;
  root: string;
  cfg: FomodConfig;
  text: string;
  choices: StepChoice[];
  from: FomodRecord["from"];
  /** Reinstall over this mod instead of adding a new one. Its version and source are kept as they are; only files, kinds and the FOMOD record change. */
  replace?: ModInfo;
}

/** Resolves the choices, stages the files, classifies them and adds (or replaces) the mod with its FOMOD record. */
export function installFomod(lib: Library, opts: InstallFomodOptions): { mod: ModInfo; unplaced: string[] } {
  const ctx: ResolveContext = { activeFiles: activeFiles(lib) };
  const completed = completeChoices(opts.cfg, opts.root, opts.choices, ctx);
  const resolved = resolveFomod(opts.cfg, opts.root, completed, ctx);
  if (resolved.errors.length) throw new Error(`The installer choices cannot be installed:\n${resolved.errors.join("\n")}`);
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "edgedeck-fomod-stage-"));
  try {
    const skipped = stageFomod(resolved, stage);
    const c = classify(stage, opts.name);
    if (c.options) {
      throw new Error(`The installer's output could not be placed: it puts its files in folders that are not Cyberpunk 2077 game folders (${c.options.map((o) => o.label).join(", ")}). Nothing was added or changed.`);
    }
    let mod: ModInfo;
    if (opts.replace) {
      if (!c.placements.length) throw new Error("Nothing to add: no files could be placed.");
      replaceModFiles(lib, opts.replace, c.placements);
      mod = opts.replace;
    } else {
      mod = addMod(lib, c.placements, { name: opts.name, version: opts.version, source: opts.source });
    }
    mod.fomod = { choices: completed, configHash: configHash(opts.text), structure: structureOf(opts.cfg), from: opts.from, targets: targetsOf(resolved) };
    saveMod(lib, mod);
    return { mod, unplaced: [...c.unplaced, ...skipped] };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
