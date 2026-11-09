// FOMOD: read a mod's fomod/ModuleConfig.xml into plain data. The resolver, the saved
// choices and the installer window build on these types.
import { XMLParser } from "fast-xml-parser";
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
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  transformTagName: (n) => n.toLowerCase(),
  transformAttributeName: (n) => n.toLowerCase(),
  isArray: (name) => REPEATING.has(name),
});

type Node = Record<string, any>;
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
  const n = node(x);
  return [...list(n.file).map((f) => fileOf(f, false)), ...list(n.folder).map((f) => fileOf(f, true))];
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
  const root = node(parser.parse(text).config);
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
