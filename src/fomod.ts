// FOMOD: read a mod's fomod/ModuleConfig.xml into plain data. The resolver, the saved
// choices and the installer window build on these types.
import { XMLParser, XMLValidator } from "fast-xml-parser";
import path from "node:path";
import fs from "./fsx";

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
  "filedependency", "dependencies", "pattern",
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
  const root = toNode(parser.parse(text)).config;
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

  const add = (list: FomodFile[]): void => {
    for (const f of list) {
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
        const key = h.to.toLowerCase();
        const old = picked.get(key);
        if (!old || f.priority >= old.priority) picked.set(key, { to: h.to, from: path.join(root, ...h.rel.split("/")), priority: f.priority });
      }
    }
  };

  add(cfg.required);
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
        add(p.files);
        for (const f of p.flags) flags[f.name] = f.value;
      }
    }
  }
  for (const c of cfg.conditional) if (holds(c.when, flags, ctx)) add(c.files);

  return { files: [...picked.values()].map(({ to, from }) => ({ from, to })), flags, visibleSteps, errors };
}
