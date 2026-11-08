// The mods page: the wide table from the design doc, in the editor area. Every mod with its
// version, kinds and status in columns, a search box, status facets, the verbs across the top and
// the library line at the bottom. The sidebar tree is the compact companion of this page.

import * as vscode from "vscode";

export interface PageRow {
  id: string;
  name: string;
  version: string;
  /** Every version of this mod in the library, newest first. */
  versions: { id: string; version: string; active: boolean }[];
  kinds: string[];
  enabled: boolean;
  /** The plain-words status phrase. */
  status: string;
  framework: boolean;
  deployed: boolean;
  /** Bytes in the library for the active version. */
  size: number;
  /** When the mod last changed on Nexus, in seconds (`updatedAt`); 0 when nothing says. */
  updated: number;
  needsDeploy: boolean;
  changed: boolean;
  conflicts: number;
  update?: string;
  nexusId?: number;
  /** What the row's Deploy/Undeploy button does; none while the page shows another loadout. */
  oneMod?: "deploy" | "undeploy";
  /** The page group this row is a file of (`page:<Nexus id>`); its name is then the file's. */
  group?: string;
}

/** A Nexus page with two or more of its files in the library: the parent row over them. */
export interface PageGroupRow {
  key: string;
  name: string;
  nexusId: number;
  /** Files on (in the loadout the page shows), of how many. */
  on: number;
  files: number;
  /** Whether the box turns back on the files that were on, rather than every file. */
  remembered: boolean;
}

export interface PageSection {
  name: string;
  /** A section of the user's own: it can be renamed, moved and deleted. */
  user: boolean;
  /** A group's rows follow each other, where its first file sits. */
  rows: PageRow[];
  groups: PageGroupRow[];
}

export interface PageData {
  rows: PageRow[];
  /** The rows grouped for display, in order: Frameworks, the user's sections, Mods. */
  sections: PageSection[];
  /** Names of the sections folded shut on the page. */
  collapsed: string[];
  /** Every loadout, with how many mods it has on. */
  loadouts: { name: string; on: number }[];
  /** The loadout the mods' on/off state belongs to: what the game gets on the next deploy. */
  activeLoadout: string;
  /** The loadout the page shows; when it is not the active one, the rows' on/off and versions are its. */
  viewing: string;
  game: string;
  library: string;
  method: "link" | "copy";
  lastDeploy?: string;
  /** Files a deploy would add or remove. */
  pending: number;
  signedIn: boolean;
  /** "REDbridge 0.4.0 (WolvenKit 9.1.0)" once it has answered, or undefined when there is none. */
  bridge?: string;
  /** A newer REDbridge release the daily check found. */
  bridgeUpdate?: string;
  /** Library totals in bytes. */
  sizes: { mods: number; downloads: number; backups: number };
  vortex: boolean;
  /** The Frameworks group's note: the game version, whether it changed since the last deploy, updates. */
  frameworks?: { summary: string; detail: string; warn: boolean; get?: string };
  /** Things not in place yet, each a button. */
  setup: { id: string; label: string; detail: string }[];
}

export interface PageMessage {
  action:
    | "setup" | "downloads" | "getBridge" | "changes" | "toggle" | "details" | "activate" | "moveUp" | "moveDown" | "open" | "nexus" | "update" | "remove" | "add" | "deploy" | "run" | "undo" | "updates" | "conflicts" | "signIn" | "library" | "moveLibrary" | "getFrameworks" | "updateAll" | "checkUpdate" | "deployOne"
    | "sectionOn" | "newSection" | "renameSection" | "deleteSection" | "moveSection" | "pickSection" | "putIn" | "place" | "fold" | "sectionMoveMods" | "sectionRemoveMods"
    | "loadoutView" | "loadoutNew" | "loadoutRename" | "loadoutDelete" | "loadoutActivate" | "loadoutExport" | "loadoutImport"
    | "groupOn" | "groupMove" | "groupSection" | "groupNexus" | "groupCheck" | "groupRemove" | "placeGroup";
  /** The page group a group action is about. */
  group?: string;
  /** loadoutView: the loadout to show. */
  loadout?: string;
  id?: string;
  /** The section a section action is about, or the one to put a mod in. */
  section?: string;
  /** sectionOn: on or off. fold: folded shut or open. */
  on?: boolean;
  /** moveSection, groupMove: up or down. */
  delta?: -1 | 1;
  /** sectionMoveMods, sectionRemoveMods: the mods shown in the section when the button was pressed. */
  ids?: string[];
  /** place: the mod to sit next to, and on which side. */
  target?: string;
  below?: boolean;
}

/** Small line icons for the row and section buttons, drawn in the current colour. */
const Icons: Record<string, string> = {
  details: '<circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4.3"/><path d="M8 4.6v.1"/>',
  up: '<path d="M8 13V3.5"/><path d="M4 7.5 8 3.5l4 4"/>',
  down: '<path d="M8 3v9.5"/><path d="M4 8.5l4 4 4-4"/>',
  section: '<path d="M8 2.2 14.3 5.5 8 8.8 1.7 5.5z"/><path d="M1.7 8.6 8 11.9l6.3-3.3"/>',
  folder: '<path d="M1.7 4.2v8.6h12.6V5.6H7.6L6.2 3.6H1.7z"/>',
  nexus: '<path d="M9.2 2.5h4.3v4.3"/><path d="M13.5 2.5 7.6 8.4"/><path d="M12 9.6v3.9H2.5V4h3.9"/>',
  remove: '<path d="M2.5 4.4h11"/><path d="M6 4.4V2.6h4v1.8"/><path d="M4 4.4l.7 9h6.6l.7-9"/><path d="M6.8 6.8v4.4M9.2 6.8v4.4"/>',
  rename: '<path d="M10.6 2.6l2.8 2.8-7.9 7.9H2.7v-2.8z"/>',
  update: '<path d="M8 13.5V5.5"/><path d="M4.8 8.7 8 5.5l3.2 3.2"/><path d="M3 2.5h10"/>',
  check: '<path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M12.2 1.9v2.8H9.4"/>',
  // Into the game (down onto the floor line) and out of it (up off it).
  deploy: '<path d="M8 2.5v8"/><path d="M4.8 7.3 8 10.5l3.2-3.2"/><path d="M2.5 13.5h11"/>',
  undeploy: '<path d="M8 10.5v-8"/><path d="M4.8 5.7 8 2.5l3.2 3.2"/><path d="M2.5 13.5h11"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  add: '<path d="M8 3v10M3 8h10"/>',
  export: '<path d="M8 10V2.5"/><path d="M5 5.5 8 2.5l3 3"/><path d="M2.5 9.5v4h11v-4"/>',
  import: '<path d="M8 2.5V10"/><path d="M5 7l3 3 3-3"/><path d="M2.5 9.5v4h11v-4"/>',
  fold: '<path d="M4.5 6.2 8 9.8l3.5-3.6"/>',
};
const icon = (name: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${Icons[name]}</svg>`;

export class ModsPage {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly onMessage: (m: PageMessage) => void) {}

  get open(): boolean {
    return this.panel !== undefined;
  }

  show(data: PageData): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel("edgedeck.page", "EDGEdeck", { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, { enableScripts: true, retainContextWhenHidden: true });
      this.panel.onDidDispose(() => (this.panel = undefined));
      this.panel.webview.onDidReceiveMessage((m: PageMessage) => this.onMessage(m));
    }
    this.panel.webview.html = renderPage(data, this.panel.webview.cspSource);
    this.panel.reveal(undefined, false);
  }

  update(data: PageData): void {
    if (this.panel) this.panel.webview.html = renderPage(data, this.panel.webview.cspSource);
  }

  /** Drops rows from the open page at once, before the work behind them; the next render settles the rest. */
  async gone(ids: string[]): Promise<void> {
    if (this.panel) await this.panel.webview.postMessage({ type: "gone", ids });
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The facets a row belongs to, for the filter chips. */
function facetsOf(r: PageRow): string[] {
  const f = [r.enabled ? "on" : "off", r.deployed ? "deployed" : "notdeployed"];
  if (r.needsDeploy) f.push("needsdeploy");
  if (r.changed) f.push("changed");
  if (r.conflicts) f.push("conflicts");
  if (r.update) f.push("update");
  return f;
}

const FacetLabels: [string, string][] = [
  ["all", "All"],
  ["on", "On"],
  ["off", "Off"],
  ["deployed", "Deployed"],
  ["notdeployed", "Not deployed"],
  ["needsdeploy", "Needs deploy"],
  ["changed", "Changed in game folder"],
  ["conflicts", "Conflicts"],
  ["update", "Update available"],
];

const fmt = (n: number): string => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(n >= 10 * (1 << 30) ? 0 : 1)} GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(n >= 10 * (1 << 20) ? 0 : 1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

/** The page's HTML from its data; exported so a check can render it without a webview. */
export function renderPage(d: PageData, csp: string): string {
  const nonce = Math.random().toString(36).slice(2);
  const msg = (m: PageMessage) => esc(JSON.stringify(m));
  const counts = new Map<string, number>([["all", d.rows.length]]);
  for (const r of d.rows) for (const f of facetsOf(r)) counts.set(f, (counts.get(f) ?? 0) + 1);
  const chips = FacetLabels.filter(([k]) => k === "all" || k === "on" || k === "off" || (counts.get(k) ?? 0) > 0)
    .map(([k, label]) => `<button class="chip" data-facet="${k}">${label} <b>${counts.get(k) ?? 0}</b></button>`)
    .join("");

  const groupName = new Map(d.sections.flatMap((s) => s.groups.map((g) => [g.key, g.name] as const)));
  const row = (r: PageRow, section: string, first: boolean, last: boolean) => {
    const statusClass = r.changed || r.conflicts ? "warn" : r.needsDeploy ? "pend" : r.deployed && r.enabled ? "ok" : "dim";
    const oneTitle =
      r.oneMod === "undeploy"
        ? r.enabled
          ? `Undeploy ${r.name}: turn it off and take only its files out of the game`
          : `Undeploy ${r.name}: take its files out of the game`
        : r.enabled
          ? `Deploy ${r.name} only: its changes go into the game now, other mods' changes keep waiting`
          : `Deploy ${r.name} only: turn it on and put it in the game now, other mods' changes keep waiting`;
    const buttons = [
      { m: { action: "deployOne", id: r.id }, icon: r.oneMod ?? "deploy", title: r.oneMod ? oneTitle : "", cls: r.oneMod ? `one ${r.oneMod}${r.oneMod === "deploy" && r.enabled && r.needsDeploy ? " upd" : ""}` : "blank" },
      { m: { action: "details", id: r.id }, icon: "details", title: "Details" },
      { m: { action: "moveUp", id: r.id }, icon: "up", title: r.group ? "Move up: wins conflicts against the file above" : "Move up: wins conflicts against the mod above", off: first },
      { m: { action: "moveDown", id: r.id }, icon: "down", title: "Move down", off: last },
      { m: { action: "pickSection", id: r.id }, icon: "section", title: r.group ? "Put this page's files in a section" : "Put in a section" },
      { m: { action: "open", id: r.id }, icon: "folder", title: "Open its library folder" },
      // A mod without an update or not from Nexus keeps a blank slot, so the icons line up down the column.
      { m: { action: "checkUpdate", id: r.id }, icon: "check", title: r.nexusId ? "Check Nexus for a newer file of this mod" : "", cls: r.nexusId ? "" : "blank" },
      { m: { action: "update", id: r.id }, icon: "update", title: r.update ? `Update to ${r.update}` : "", cls: r.update ? "upd" : "blank" },
      { m: { action: "nexus", id: r.id }, icon: "nexus", title: "Open on Nexus", cls: r.nexusId ? "" : "blank" },
      { m: { action: "remove", id: r.id }, icon: "remove", title: r.versions.length > 1 ? `Remove version ${r.version} from Library` : "Remove from Library", cls: "danger" },
    ] as { m: PageMessage; icon: string; title: string; off?: boolean; cls?: string }[];
    const text = `${r.group ? `${groupName.get(r.group) ?? ""} ` : ""}${r.name} ${r.versions.map((v) => v.version).join(" ")} ${r.kinds.join(" ")} ${r.status}`.toLowerCase();
    // The version cell: a dropdown when there is anything to choose, the version alone otherwise.
    const versionCell =
      r.versions.length > 1 || r.update
        ? `<select class="ver" title="Versions in the library; the chosen one takes this mod's place">${r.versions
            .map((v) => `<option value='${msg({ action: "activate", id: v.id })}' ${v.active ? "selected" : ""}>${esc(v.version || "(no version)")}</option>`)
            .join("")}${r.update ? `<option value='${msg({ action: "update", id: r.id })}' class="get">Get ${esc(r.update)} from Nexus</option>` : ""}</select>`
        : `<span class="mono">${esc(r.version)}</span>`;
    return `<tr draggable="true" data-id="${esc(r.id)}" data-group="${esc(section)}"${r.group ? ` data-pg="${esc(r.group)}"` : ""} data-facets="${facetsOf(r).join(" ")}" data-text="${esc(text)}" data-size="${r.size}" data-updated="${r.updated}" class="${r.enabled ? "" : "offrow"}">
<td class="chk"><input type="checkbox" ${r.enabled ? "checked" : ""} data-msg='${msg({ action: "toggle", id: r.id })}' title="${r.enabled ? "Turn off" : "Turn on"}"></td>
<td class="name${r.group ? " child" : ""}"><a data-msg='${msg({ action: "details", id: r.id })}'>${esc(r.name)}</a></td>
<td class="vercell">${versionCell}</td>
<td>${[...r.kinds].sort((a, b) => (a === "framework" ? -1 : b === "framework" ? 1 : 0)).map((k) => `<span class="kind ${k === "framework" ? "fw" : ""}">${esc(k)}</span>`).join("")}</td>
<td class="mono size" data-size="${r.size}" title="${r.size.toLocaleString()} bytes in the library">${fmt(r.size)}</td>
<td class="mono upd8"${r.updated ? ` title="When this mod's file, or the newest file of its line, was uploaded to Nexus"` : ""}>${r.updated ? new Date(r.updated * 1000).toISOString().slice(0, 10) : ""}</td>
<td class="${statusClass}">${r.needsDeploy || r.changed ? `<a class="st" data-msg='${msg({ action: "changes", id: r.id })}' title="What the next deploy does for this mod">${esc(r.status)}</a>` : esc(r.status)}${r.update ? `<a class="upd" data-msg='${msg({ action: "update", id: r.id })}' title="Download ${esc(r.update)} from Nexus and put it in this mod's place">update ${esc(r.update)} available</a>` : ""}</td>
<td class="acts">${buttons.map((b) => `<button class="ico ${b.cls ?? ""}" data-msg='${msg(b.m)}' title="${esc(b.title)}" aria-label="${esc(b.title)}" ${b.off ? "disabled" : ""}>${icon(b.icon)}</button>`).join("")}</td>
</tr>`;
  };
  const on = (rs: PageRow[]) => rs.filter((r) => r.enabled).length;
  const note = (s: PageSection) => (s.name === "Frameworks" && !s.user && d.frameworks ? ` <span class="fwnote ${d.frameworks.warn ? "warn" : ""}" title="${esc(d.frameworks.detail)}">${esc(d.frameworks.summary)}</span>${d.frameworks.get ? ` <a class="fwget" data-msg='${msg({ action: "getFrameworks" })}'>${esc(d.frameworks.get)}</a>` : ""}` : "");
  const users = d.sections.filter((s) => s.user);
  const groupRow = (s: PageSection) => {
    const n = on(s.rows);
    const all = s.rows.length > 0 && n === s.rows.length;
    const some = n > 0 && !all;
    // For the mods shown in the section (the search and the filter apply): move them all, or remove them all.
    const bulk = [
      { action: "sectionMoveMods", icon: "section", title: `Put the mods shown in ${esc(s.name)} in another section` },
      { action: "sectionRemoveMods", icon: "remove", title: `Remove the mods shown in ${esc(s.name)} from Library`, cls: "danger" },
    ]
      .map((b) => `<button class="ico ${b.cls ?? ""}" data-bulk="${b.action}" data-section="${esc(s.name)}" title="${b.title}" aria-label="${b.title}" ${s.rows.length ? "" : "disabled"}>${icon(b.icon)}</button>`)
      .join("");
    const tools = s.user
      ? ([
          { m: { action: "renameSection", section: s.name }, icon: "rename", title: "Rename this section" },
          { m: { action: "moveSection", section: s.name, delta: -1 }, icon: "up", title: "Move this section up", off: users[0] === s },
          { m: { action: "moveSection", section: s.name, delta: 1 }, icon: "down", title: "Move this section down", off: users[users.length - 1] === s },
          { m: { action: "deleteSection", section: s.name }, icon: "close", title: "Delete this section; its mods go back to Mods", cls: "danger" },
        ] as { m: PageMessage; icon: string; title: string; off?: boolean; cls?: string }[])
          .map((b) => `<button class="ico ${b.cls ?? ""}" data-msg='${msg(b.m)}' title="${b.title}" aria-label="${b.title}" ${b.off ? "disabled" : ""}>${icon(b.icon)}</button>`)
          .join("")
      : "";
    const box = s.rows.length
      ? `<input type="checkbox" class="all" data-section="${esc(s.name)}" ${all ? "checked" : ""} data-some="${some ? 1 : 0}" title="${all ? "Turn off" : "Turn on"} every mod in ${esc(s.name)}">`
      : "";
    return `<tr class="group ${d.collapsed.includes(s.name) ? "folded" : ""}" data-groupfor="${esc(s.name)}"><td class="chk">${box}</td><td colspan="7"><div class="gline"><button class="fold" data-fold="${esc(s.name)}" aria-expanded="${d.collapsed.includes(s.name) ? "false" : "true"}" title="Fold or unfold ${esc(s.name)}">${icon("fold")}<span class="glabel">${esc(s.name)}</span></button> <span class="dim">${s.rows.length}, ${n} on, ${fmt(s.rows.reduce((t, r) => t + r.size, 0))}</span>${note(s)}<span class="spacer"></span>${bulk}${tools ? `<span class="gsep"></span>${tools}` : ""}</div></td></tr>`;
  };
  // A page group's own row: its box, its name, and buttons in the same slots as a mod row's.
  const pageGroupRow = (g: PageGroupRow, rows: PageRow[], section: string, first: boolean, last: boolean) => {
    const some = g.on > 0 && g.on < g.files;
    const title = g.on
      ? `Turn off every file of ${g.name}; ticking it again turns ${g.on === 1 ? "this one" : `these ${g.on}`} back on`
      : g.remembered
        ? `Turn on the files of ${g.name} that were on last time`
        : `Turn on every file of ${g.name}`;
    const blank = { m: { action: "details" }, icon: "details", title: "", cls: "blank" };
    const buttons = [
      blank,
      blank,
      { m: { action: "groupMove", group: g.key, delta: -1 }, icon: "up", title: "Move this page's files up together", off: first },
      { m: { action: "groupMove", group: g.key, delta: 1 }, icon: "down", title: "Move this page's files down together", off: last },
      { m: { action: "groupSection", group: g.key }, icon: "section", title: "Put this page's files in a section" },
      blank,
      { m: { action: "groupCheck", group: g.key }, icon: "check", title: "Check Nexus for newer versions of these files" },
      blank,
      { m: { action: "groupNexus", group: g.key }, icon: "nexus", title: "Open the page on Nexus" },
      { m: { action: "groupRemove", group: g.key }, icon: "remove", title: `Remove from Library: all ${g.files} files of this page, on or off`, cls: "danger" },
    ] as { m: PageMessage; icon: string; title: string; off?: boolean; cls?: string }[];
    const folded = d.collapsed.includes(g.key);
    const size = fmt(rows.reduce((t, r) => t + r.size, 0));
    return `<tr class="pghead ${folded ? "folded" : ""} ${g.on ? "" : "offrow"}" draggable="true" data-pg="${esc(g.key)}" data-group="${esc(section)}">
<td class="chk"><input type="checkbox" class="pgall" data-pg="${esc(g.key)}" ${g.on ? "checked" : ""} data-some="${some ? 1 : 0}" title="${esc(title)}"></td>
<td colspan="6"><div class="gline"><button class="fold pgfold" data-fold="${esc(g.key)}" aria-expanded="${folded ? "false" : "true"}" title="Fold or unfold the files of ${esc(g.name)}">${icon("fold")}<span class="pglabel">${esc(g.name)}</span></button> <span class="dim">${g.files} files from one Nexus page, ${g.on} on, ${size}</span></div></td>
<td class="acts">${buttons.map((b) => `<button class="ico ${b.cls ?? ""}" data-msg='${msg(b.m)}' title="${esc(b.title)}" aria-label="${esc(b.title)}" ${b.off ? "disabled" : ""}>${icon(b.icon)}</button>`).join("")}</td>
</tr>`;
  };
  // A section's rows by what moves as one: a mod, or a group's row with its files under it.
  const sectionBody = (s: PageSection) => {
    const units: PageRow[][] = [];
    for (const r of s.rows) {
      const prev = units[units.length - 1];
      if (r.group && prev && prev[0].group === r.group) prev.push(r);
      else units.push([r]);
    }
    return units
      .map((u, ui) => {
        const g = u[0].group ? s.groups.find((x) => x.key === u[0].group) : undefined;
        const first = ui === 0;
        const last = ui === units.length - 1;
        if (!g) return row(u[0], s.name, first, last);
        return pageGroupRow(g, u, s.name, first, last) + u.map((r, i) => row(r, s.name, i === 0, i === u.length - 1)).join("");
      })
      .join("");
  };
  const body = d.sections
    .map((s) => groupRow(s) + (s.rows.length ? sectionBody(s) : `<tr class="hint" data-hintfor="${esc(s.name)}"><td></td><td colspan="7">Empty. Drag mods here, or use a mod's section button.</td></tr>`))
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${csp}; script-src 'nonce-${nonce}';">
<style>
:root { --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground); --dim: var(--vscode-descriptionForeground); --line: var(--vscode-widget-border, #262c3d); --yellow: #fcee0a; --cyan: #19f3ff; --green: #5dffa1; --red: #ff2a52; --ink: #0b0d12; }
/* Light themes: the HUD accents darkened so they read on white. */
body.vscode-light, body.vscode-high-contrast-light { --yellow: #7a6a00; --cyan: #00727a; --green: #17803d; --red: #c4002b; --ink: #ffffff; }
body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--fg); background: var(--bg); padding: 14px 20px 24px; }
.top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
h1 { font-size: 20px; margin: 0; letter-spacing: .02em; text-transform: uppercase; } h1 span { color: var(--yellow); } h1 small { font-size: 12px; color: var(--dim); text-transform: none; letter-spacing: 0; margin-left: 10px; }
.spacer { flex: 1; }
button { font: inherit; font-size: 12px; background: transparent; color: var(--fg); border: 1px solid var(--line); padding: 5px 12px; cursor: pointer; white-space: nowrap; }
button:hover { border-color: var(--yellow); color: var(--yellow); }
button.deploy { background: var(--yellow); color: var(--ink); border-color: var(--yellow); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
button.deploy:hover { background: transparent; color: var(--yellow); }
button.deploy.idle { background: transparent; color: var(--dim); border-color: var(--line); font-weight: 500; }
.filters { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }
input[type=search] { font: inherit; color: var(--fg); background: var(--vscode-input-background, transparent); border: 1px solid var(--vscode-input-border, var(--line)); padding: 5px 10px; min-width: 260px; }
input[type=search]:focus { outline: none; border-color: var(--yellow); }
.chip { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; padding: 3px 9px; color: var(--dim); }
.chip b { font-weight: 500; color: var(--fg); margin-left: 3px; } .chip.active { color: var(--yellow); border-color: var(--yellow); } .chip.active b { color: var(--yellow); }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
th { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); font-weight: 500; }
tr.group td { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--cyan); padding-top: 14px; padding-bottom: 4px; border-bottom: 1px solid var(--line); }
td.chk, th.chk { width: 1%; } td.acts, th.acts { width: 1%; white-space: nowrap; } td.name a { cursor: pointer; color: var(--fg); } td.name a:hover { color: var(--yellow); text-decoration: underline; }
tr.offrow td.name a, tr.offrow td.mono { color: var(--dim); }
.kind { font-family: var(--vscode-editor-font-family); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; padding: 1px 6px; border: 1px solid var(--line); color: var(--dim); margin-right: 4px; } .kind.fw { color: var(--yellow); border-color: var(--yellow); }
.mono { font-family: var(--vscode-editor-font-family); font-size: 12px; } .dim { color: var(--dim); } .ok { color: var(--green); } .warn { color: var(--yellow); } .pend { color: var(--cyan); }
a.st { color: inherit; cursor: pointer; } a.st:hover { text-decoration: underline; }
a.changes { color: var(--yellow); cursor: pointer; font-size: 12px; } a.changes:hover { text-decoration: underline; }
td.size { text-align: right; white-space: nowrap; } td.upd8 { white-space: nowrap; } th.size { text-align: right; }
.sep { color: var(--line); margin: 0 4px; }
.upd { display: block; color: var(--yellow); font-size: 12px; cursor: pointer; } .upd:hover { text-decoration: underline; }
select.ver { font-family: var(--vscode-editor-font-family); font-size: 12px; color: var(--fg); background: var(--vscode-dropdown-background, var(--bg)); border: 1px solid var(--vscode-dropdown-border, var(--line)); padding: 2px 6px; cursor: pointer; }
select.ver:hover, select.ver:focus { border-color: var(--yellow); outline: none; } select.ver option.get { color: var(--yellow); }
td.vercell { white-space: nowrap; }
button.ico { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 22px; padding: 0; border-color: transparent; color: var(--dim); }
button.ico svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
tr:hover button.ico { color: var(--fg); }
button.ico:hover, tr:hover button.ico:hover { color: var(--yellow); border-color: var(--yellow); } button.ico.danger:hover, tr:hover button.ico.danger:hover { color: var(--red); border-color: var(--red); }
button.ico.blank { visibility: hidden; }
button.ico.upd { color: var(--yellow); }
button:disabled { opacity: .4; cursor: default; }
button.ico:disabled, tr:hover button.ico:disabled { color: var(--dim); opacity: .3; cursor: default; border-color: transparent; }
.gline { display: flex; align-items: center; gap: 6px; } .gline .glabel { color: var(--cyan); } .gline .dim, .gline .fwnote { letter-spacing: 0; text-transform: none; }
.gline button.ico { width: 22px; height: 20px; }
.loadouts { display: flex; align-items: center; gap: 6px; margin: 0 0 10px; }
.loadouts .ltitle { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.loadouts select { font: inherit; font-size: 12px; color: var(--fg); background: var(--vscode-dropdown-background, var(--bg)); border: 1px solid var(--vscode-dropdown-border, var(--line)); padding: 3px 8px; min-width: 220px; cursor: pointer; }
.loadouts select:hover, .loadouts select:focus { border-color: var(--yellow); outline: none; }
.loadouts .lib { font-size: 12px; color: var(--fg); cursor: pointer; text-decoration: underline; text-decoration-color: var(--line); } .loadouts .lib:hover { color: var(--yellow); }
button.activate { color: var(--yellow); border-color: var(--yellow); margin-left: 6px; }
.editing { border: 1px solid var(--cyan); color: var(--cyan); padding: 7px 12px; margin-bottom: 12px; } .editing b { color: var(--fg); font-weight: 600; }
.stfor { text-transform: none; letter-spacing: 0; color: var(--cyan); }
.gsep { width: 1px; height: 14px; background: var(--line); margin: 0 4px; }
button.fold { display: inline-flex; align-items: center; gap: 4px; border: none; padding: 0 4px 0 0; font: inherit; letter-spacing: inherit; text-transform: inherit; color: var(--cyan); }
button.fold svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; transition: transform .12s; }
button.fold:hover, button.fold:hover .glabel { color: var(--yellow); }
tr.folded button.fold svg { transform: rotate(-90deg); }
tr.hint td { color: var(--dim); font-style: italic; font-size: 12px; }
tr.pghead button.fold { color: var(--fg); } tr.pghead .pglabel { font-weight: 600; } tr.pghead.offrow .pglabel { color: var(--dim); } tr.pghead button.fold:hover .pglabel { color: var(--yellow); }
td.name.child { padding-left: 30px; position: relative; }
td.name.child::before { content: ""; position: absolute; left: 14px; top: 0; bottom: 50%; width: 9px; border-left: 1px solid var(--line); border-bottom: 1px solid var(--line); }
tr[draggable] { cursor: grab; } tr.dragging { opacity: .4; }
tr.dropabove td { box-shadow: inset 0 2px 0 var(--yellow); } tr.dropbelow td { box-shadow: inset 0 -2px 0 var(--yellow); }
tr.group.dropin td, tr.hint.dropin td { background: color-mix(in srgb, var(--yellow) 12%, transparent); }
th { position: relative; } .grip { position: absolute; top: 0; right: -3px; width: 7px; height: 100%; cursor: col-resize; z-index: 1; }
.grip:hover, .grip.on { background: linear-gradient(to right, transparent 3px, var(--yellow) 3px, var(--yellow) 4px, transparent 4px); }
table.fixed { table-layout: fixed; } table.fixed th { box-sizing: border-box; } table.fixed td { overflow: hidden; text-overflow: ellipsis; } table.fixed select.ver { max-width: 100%; }
input[type=checkbox] { accent-color: var(--yellow); width: 15px; height: 15px; cursor: pointer; }
.foot { margin-top: 14px; color: var(--dim); font-size: 12px; display: flex; gap: 18px; flex-wrap: wrap; } .foot a { cursor: pointer; color: var(--dim); text-decoration: underline; } .foot a:hover { color: var(--yellow); }
.fwnote { letter-spacing: 0; text-transform: none; color: var(--dim); margin-left: 10px; cursor: default; } .fwnote.warn { color: var(--yellow); }
.okdot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--green); margin-right: 6px; vertical-align: middle; }
.empty { padding: 24px 8px; color: var(--dim); }
.setup { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; color: var(--dim); }
.note { border: 1px solid var(--yellow); color: var(--yellow); padding: 8px 12px; margin-bottom: 12px; }
</style></head><body>
<div class="top">
  <h1>EDGE<span>deck</span><small>${esc(d.game)}</small></h1>
  <span class="spacer"></span>
  <button data-msg='${msg({ action: "add" })}'>+ Add mod</button>
  <button data-msg='${msg({ action: d.signedIn ? "updates" : "signIn" })}' title="${d.signedIn ? "Ask Nexus for newer files" : "Sign in to Nexus Mods"}">${d.signedIn ? "Check updates" : "Nexus sign in"}</button>
  ${(() => {
    // The script keeps this in step with the search and the filter: it updates the rows they leave showing.
    const n = d.rows.filter((r) => r.update).length;
    return `<button id="updall" ${n ? "" : "disabled"} title="${n ? `Download the newest file of the ${n === 1 ? "mod" : `${n} mods`} with an update waiting, each in its mod's place` : "No updates waiting; Check updates asks Nexus"}">Update all${n ? ` <b>${n}</b>` : ""}</button>`;
  })()}
  <button data-msg='${msg({ action: "conflicts" })}'>Conflicts${d.rows.some((r) => r.conflicts) ? ` <b>${d.rows.filter((r) => r.conflicts).length}</b>` : ""}</button>
  ${d.lastDeploy ? `<button data-msg='${msg({ action: "undo" })}' title="Remove every deployed file and put backups back">Undo deploy</button>` : ""}
  ${d.pending ? `<a class="changes" data-msg='${msg({ action: "changes" })}' title="Every file the next deploy touches, and why">${d.pending} change${d.pending === 1 ? "" : "s"}</a>` : ""}
  <button class="deploy ${d.pending ? "" : "idle"}" data-msg='${msg({ action: "deploy" })}'>${d.pending ? "Deploy" : "Deployed"}</button>
  <button data-msg='${msg({ action: "run" })}' title="Start Cyberpunk 2077 with -modded${d.pending ? ", after deploying the changes waiting" : ""}">Run game</button>
</div>
${d.vortex ? `<div class="note">Vortex manages this game folder. Purge in Vortex before deploying with EDGEdeck.</div>` : ""}
${d.setup.length ? `<div class="setup"><span>Set up:</span>${d.setup.map((s) => `<button data-msg='${msg({ action: "setup", id: s.id })}' title="${esc(s.detail)}">${esc(s.label)}</button>`).join("")}</div>` : ""}
<div class="loadouts">
  <span class="ltitle">Loadout</span>
  <select id="loadout" title="The loadout this page shows. The active one is what the game gets on the next deploy; another can be edited here without touching the game.">${d.loadouts
    .map((l) => `<option value="${esc(l.name)}" ${l.name === d.viewing ? "selected" : ""}>${esc(l.name)}${l.name === d.activeLoadout ? " (active)" : ""} · ${l.on} on</option>`)
    .join("")}</select>
  ${(
    [
      { m: { action: "loadoutNew" }, icon: "add", title: "New loadout: a copy of this one, or every mod off" },
      { m: { action: "loadoutRename" }, icon: "rename", title: "Rename this loadout" },
      { m: { action: "loadoutExport" }, icon: "export", title: "Export this loadout to a file, to share or keep" },
      { m: { action: "loadoutImport" }, icon: "import", title: "Import a loadout file as a new loadout" },
      { m: { action: "loadoutDelete" }, icon: "close", title: d.viewing === d.activeLoadout ? "The active loadout cannot be deleted" : "Delete this loadout", cls: "danger", off: d.viewing === d.activeLoadout },
    ] as { m: PageMessage; icon: string; title: string; off?: boolean; cls?: string }[]
  )
    .map((b) => `<button class="ico ${b.cls ?? ""}" data-msg='${msg(b.m)}' title="${b.title}" aria-label="${b.title}" ${b.off ? "disabled" : ""}>${icon(b.icon)}</button>`)
    .join("")}
  ${d.viewing !== d.activeLoadout ? `<button class="activate" data-msg='${msg({ action: "loadoutActivate" })}' title="Make ${esc(d.viewing)} the active loadout: its mods go on, the others off. Deploy afterwards.">Make active</button>` : ""}
  <span class="spacer"></span>
  ${(() => {
    // Every row is a mod in the library; say so where the eye starts, not only in the footer.
    const versions = d.rows.reduce((n, r) => n + Math.max(1, r.versions.length), 0);
    const what = `${d.rows.length} mod${d.rows.length === 1 ? "" : "s"}${versions > d.rows.length ? `, ${versions} versions` : ""}`;
    return `<span class="ltitle">Library</span><a class="lib" data-msg='${msg({ action: "library" })}' title="Every mod in this list, on or off, is kept here: ${esc(d.library)}. The edgedeck.libraryPath setting; Move library... moves it">${what}</a>`;
  })()}
</div>
${d.viewing !== d.activeLoadout ? `<div class="editing">Editing the loadout <b>${esc(d.viewing)}</b>. The game, the sidebar and Deploy still use <b>${esc(d.activeLoadout)}</b>. Turning mods on or off here changes ${esc(d.viewing)} only; the order, sections and the library are shared.</div>` : ""}
<div class="filters">
  <input type="search" id="q" placeholder="Search name, version, kind or status" autocomplete="off">
  ${chips}
  <span class="sep">|</span>
  <button class="chip" id="bysize" title="Biggest mods first, across every section">Largest first</button>
  <button class="chip" id="bydate" title="Most recently updated mods first, across every section">Newest update first</button>
  <span class="spacer"></span>
  <button data-msg='${msg({ action: "newSection" })}' title="A section of your own to group mods in">+ Section</button>
</div>
${d.rows.length ? `<table class="mods"><thead><tr><th class="chk"></th><th>Mod</th><th>Ver</th><th>Kind</th><th class="size">Size</th><th class="upd8">Updated</th><th title="${d.viewing !== d.activeLoadout ? `What the game has, from the active loadout ${esc(d.activeLoadout)}` : ""}">Status${d.viewing !== d.activeLoadout ? ` <span class="stfor">in ${esc(d.activeLoadout)}</span>` : ""}</th><th class="acts">Actions</th></tr></thead><tbody id="rows">${body}</tbody></table><div class="empty" id="none" hidden>No mod matches.</div>` : `<div class="empty">No mods yet. Press + Add mod, or import from Vortex from the Mods view menu.</div>`}
<div class="foot">
  <span>Library: <a data-msg='${msg({ action: "library" })}'>${esc(d.library)}</a> (${d.method === "link" ? "same drive as the game: hardlinks" : `other drive: copies. <a data-msg='${msg({ action: "moveLibrary" })}'>Move library...</a>`})</span>
  <span>Last deploy: ${d.lastDeploy ? esc(d.lastDeploy) : "never"}</span>
  <span title="Deployed files are hardlinks and take no extra space on the same drive">Disk: ${fmt(d.sizes.mods)} in mods, <a data-msg='${msg({ action: "downloads" })}' title="The original zips, kept so a mod can be added again. Safe to delete.">${fmt(d.sizes.downloads)} in kept downloads</a>${d.sizes.backups ? `, ${fmt(d.sizes.backups)} in deploy backups` : ""}</span>
  <span>${d.bridge ? `<span class="okdot"></span>${esc(d.bridge)}${d.bridgeUpdate ? ` · <a data-msg='${msg({ action: "getBridge" })}' title="Download it into EDGEdeck's folder; the old one is removed">${esc(d.bridgeUpdate)} available</a>` : ""}` : `No REDbridge: <a data-msg='${msg({ action: "getBridge" })}'>Get REDbridge</a> for conflicts inside archives`}</span>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const state = Object.assign({ q: "", facet: "all", bySize: false, byDate: false, widths: null }, vscode.getState() || {});
  // Largest first or Newest update first: one flat list across the sections, no dragging.
  const sorted = () => state.bySize || state.byDate;
  const post = (m) => vscode.postMessage(m);
  const tbody = document.getElementById("rows");
  const original = tbody ? [...tbody.children] : [];
  function order() {
    if (!tbody) return;
    if (sorted()) {
      const key = state.byDate ? "updated" : "size";
      const rs = [...tbody.querySelectorAll("tr[data-size]")].sort((a, b) => Number(b.dataset[key]) - Number(a.dataset[key]));
      for (const g of tbody.querySelectorAll("tr.group, tr.pghead")) g.remove();
      for (const r of rs) tbody.appendChild(r);
    } else {
      tbody.replaceChildren(...original);
    }
    document.getElementById("bysize").classList.toggle("active", state.bySize);
    document.getElementById("bydate").classList.toggle("active", state.byDate);
  }
  const q = document.getElementById("q");
  const rows = [...document.querySelectorAll("tr[data-facets]")];
  const groups = [...document.querySelectorAll("tr.group")];
  const pgs = [...document.querySelectorAll("tr.pghead")];
  // Folded sections show only their header; a search or a filter opens them while it lasts.
  const folded = new Set(${JSON.stringify(d.collapsed).replace(/</g, "\\u003c")});
  function apply() {
    const needle = state.q.trim().toLowerCase();
    let shown = 0;
    for (const r of rows) {
      const ok = (state.facet === "all" || r.dataset.facets.split(" ").includes(state.facet)) && (!needle || r.dataset.text.includes(needle));
      r.dataset.match = ok ? "1" : ""; if (ok) shown++;
    }
    const filtering = !!needle || state.facet !== "all";
    for (const r of rows) r.hidden = !r.dataset.match || (!filtering && !sorted() && (folded.has(r.dataset.group) || (!!r.dataset.pg && folded.has(r.dataset.pg))));
    // A page group's row shows while any of its files does, and folds like a section.
    for (const p of pgs) {
      p.hidden = sorted() || (filtering ? !rows.some((r) => r.dataset.match && r.dataset.pg === p.dataset.pg) : folded.has(p.dataset.group));
      p.classList.toggle("folded", !filtering && folded.has(p.dataset.pg));
    }
    for (const g of groups) {
      g.hidden = sorted() || (filtering && !rows.some((r) => r.dataset.match && r.dataset.group === g.dataset.groupfor));
      g.classList.toggle("folded", !filtering && folded.has(g.dataset.groupfor));
    }
    for (const h of document.querySelectorAll("tr.hint")) h.hidden = sorted() || filtering || folded.has(h.dataset.hintfor);
    for (const c of document.querySelectorAll(".chip")) c.classList.toggle("active", c.dataset.facet === state.facet);
    const none = document.getElementById("none"); if (none) none.hidden = shown > 0;
    const upd = document.getElementById("updall");
    if (upd) {
      const n = toUpdate().length;
      upd.disabled = !n;
      upd.innerHTML = (filtering ? "Update shown" : "Update all") + (n ? " <b>" + n + "</b>" : "");
      upd.title = n
        ? "Download the newest file of the " + (n === 1 ? "mod" : n + " mods") + (filtering ? " shown" : "") + " with an update waiting, each in its mod's place"
        : filtering ? "None of the mods shown has an update waiting" : "No updates waiting; Check updates asks Nexus";
    }
    vscode.setState(state);
  }
  // The rows Update all acts on: those the search and the filter leave showing that have an update.
  function toUpdate() {
    return rows.filter((r) => r.dataset.match && r.dataset.facets.split(" ").includes("update")).map((r) => r.dataset.id);
  }
  const updall = document.getElementById("updall");
  if (updall) updall.addEventListener("click", () => {
    const filtering = !!state.q.trim() || state.facet !== "all";
    post(filtering ? { action: "updateAll", ids: toUpdate() } : { action: "updateAll" });
  });
  if (q) { q.value = state.q; q.addEventListener("input", () => { state.q = q.value; apply(); }); }
  for (const c of document.querySelectorAll(".chip[data-facet]")) c.addEventListener("click", () => { state.facet = c.dataset.facet; apply(); });
  document.getElementById("bysize").addEventListener("click", () => { state.bySize = !state.bySize; if (state.bySize) state.byDate = false; order(); apply(); });
  document.getElementById("bydate").addEventListener("click", () => { state.byDate = !state.byDate; if (state.byDate) state.bySize = false; order(); apply(); });
  order();
  // A section's bulk buttons act on the rows of that section the search and filter leave showing.
  for (const b of document.querySelectorAll("button[data-bulk]")) b.addEventListener("click", () => {
    const ids = rows.filter((r) => r.dataset.match && r.dataset.group === b.dataset.section).map((r) => r.dataset.id);
    post({ action: b.dataset.bulk, section: b.dataset.section, ids });
  });
  for (const b of document.querySelectorAll("button.fold")) b.addEventListener("click", () => {
    const name = b.dataset.fold;
    const on = !folded.has(name);
    if (on) folded.add(name); else folded.delete(name);
    b.setAttribute("aria-expanded", on ? "false" : "true");
    post({ action: "fold", section: name, on });
    apply();
  });
  for (const b of document.querySelectorAll("button[data-msg], a[data-msg]")) b.addEventListener("click", () => post(JSON.parse(b.dataset.msg)));
  for (const c of document.querySelectorAll("input[type=checkbox][data-msg]")) c.addEventListener("change", () => vscode.postMessage(JSON.parse(c.dataset.msg)));
  // A section's box: on when every mod in it is on, a dash when some are; a click turns them all on or off.
  for (const c of document.querySelectorAll("input.all")) {
    c.indeterminate = c.dataset.some === "1";
    c.addEventListener("change", () => post({ action: "sectionOn", section: c.dataset.section, on: c.checked }));
  }
  // A page group's box: a dash while some of its files are on. A click turns every file off and
  // remembers which were on, or turns those back on.
  for (const c of document.querySelectorAll("input.pgall")) {
    c.indeterminate = c.dataset.some === "1";
    c.addEventListener("change", () => post({ action: "groupOn", group: c.dataset.pg }));
  }

  // Drag a row onto another to put it above or below that one (and in its section), or onto a section's header to move it there.
  // A file of a page group moves only among its group's files; a group's row moves the whole group.
  let dragId = null, dragPg = "", dragGroup = null;
  const firstOf = (pg) => rows.find((x) => x.dataset.pg === pg)?.dataset.id;
  const unmark = () => { for (const e of document.querySelectorAll(".dropabove, .dropbelow, .dropin")) e.classList.remove("dropabove", "dropbelow", "dropin"); };
  for (const r of rows) {
    r.addEventListener("dragstart", (e) => {
      if (sorted()) { e.preventDefault(); return; }
      dragId = r.dataset.id; dragPg = r.dataset.pg || ""; dragGroup = null; r.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", r.dataset.id);
    });
    r.addEventListener("dragend", () => { r.classList.remove("dragging"); unmark(); dragId = null; });
    const below = (e) => { const b = r.getBoundingClientRect(); return e.clientY > b.top + b.height / 2; };
    const takes = () => (dragGroup ? r.dataset.pg !== dragGroup : !!dragId && dragId !== r.dataset.id && (!dragPg || r.dataset.pg === dragPg));
    r.addEventListener("dragover", (e) => {
      if (!takes()) return;
      e.preventDefault(); unmark(); r.classList.add(below(e) ? "dropbelow" : "dropabove");
    });
    r.addEventListener("drop", (e) => {
      e.preventDefault(); unmark();
      if (!takes()) return;
      if (dragGroup) post({ action: "placeGroup", group: dragGroup, target: r.dataset.id, below: below(e) });
      else post({ action: "place", id: dragId, target: r.dataset.id, below: below(e) });
    });
  }
  for (const p of pgs) {
    p.addEventListener("dragstart", (e) => {
      if (sorted()) { e.preventDefault(); return; }
      dragGroup = p.dataset.pg; dragId = null; dragPg = ""; p.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.dataset.pg);
    });
    p.addEventListener("dragend", () => { p.classList.remove("dragging"); unmark(); dragGroup = null; });
    // Dropped on a group's row: above or below the whole group. Its own files do not leave it.
    const below = (e) => { const b = p.getBoundingClientRect(); return e.clientY > b.top + b.height / 2; };
    const takes = () => (dragGroup ? dragGroup !== p.dataset.pg : !!dragId && !dragPg);
    p.addEventListener("dragover", (e) => { if (!takes()) return; e.preventDefault(); unmark(); p.classList.add(below(e) ? "dropbelow" : "dropabove"); });
    p.addEventListener("drop", (e) => {
      e.preventDefault(); unmark();
      const target = firstOf(p.dataset.pg);
      if (!takes() || !target) return;
      if (dragGroup) post({ action: "placeGroup", group: dragGroup, target, below: below(e) });
      else post({ action: "place", id: dragId, target, below: below(e) });
    });
  }
  for (const g of document.querySelectorAll("tr.group, tr.hint")) {
    const section = g.dataset.groupfor ?? g.dataset.hintfor;
    g.addEventListener("dragover", (e) => { if (!dragId && !dragGroup) return; e.preventDefault(); unmark(); g.classList.add("dropin"); });
    g.addEventListener("drop", (e) => {
      e.preventDefault(); unmark();
      // A group, or a file of one, goes to the section with all its files (sections.ts).
      const id = dragGroup ? firstOf(dragGroup) : dragId;
      if (id) post({ action: "putIn", id, section });
    });
  }

  // Column widths: drag the edge of a heading; double-click it to go back to automatic widths.
  // Status takes whatever room is left, so the table always fills the page.
  const table = document.querySelector("table.mods");
  if (table) {
    const ths = [...table.querySelectorAll("thead th")];
    const flex = ths.findIndex((t) => t.textContent.startsWith("Status"));
    const widths = () => {
      const w = state.widths;
      const ok = Array.isArray(w) && w.length === ths.length;
      table.classList.toggle("fixed", ok);
      ths.forEach((t, i) => (t.style.width = ok && i !== flex ? w[i] + "px" : ""));
      table.style.minWidth = ok ? w.reduce((n, x, i) => n + (i === flex ? 120 : x), 0) + "px" : "";
    };
    ths.forEach((th, i) => {
      if (i === 0 || i >= flex) return;
      const g = document.createElement("span");
      g.className = "grip"; g.title = "Drag to resize; double-click for automatic widths";
      th.appendChild(g);
      g.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (!(Array.isArray(state.widths) && state.widths.length === ths.length)) state.widths = ths.map((t) => Math.round(t.getBoundingClientRect().width));
        widths();
        const x0 = e.clientX, w0 = state.widths[i];
        g.classList.add("on");
        const move = (ev) => { state.widths[i] = Math.max(36, Math.round(w0 + ev.clientX - x0)); widths(); };
        const up = () => { g.classList.remove("on"); document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); vscode.setState(state); };
        document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
      });
      g.addEventListener("dblclick", () => { state.widths = null; widths(); vscode.setState(state); });
    });
    widths();
  }
  for (const s of document.querySelectorAll("select.ver")) s.addEventListener("change", () => { if (s.value) vscode.postMessage(JSON.parse(s.value)); });
  // Rows the extension is removing go at once; a page group's row goes with its last file.
  window.addEventListener("message", (e) => {
    const m = e.data;
    if (!m || m.type !== "gone") return;
    const ids = new Set(m.ids);
    const going = (el) => ids.has(el.dataset.id) || (el.classList.contains("pghead") && rows.every((r) => r.dataset.pg !== el.dataset.pg || ids.has(r.dataset.id)));
    for (const el of [...original, ...rows, ...pgs]) if (going(el)) el.remove();
    for (let i = original.length - 1; i >= 0; i--) if (going(original[i])) original.splice(i, 1);
    for (let i = rows.length - 1; i >= 0; i--) if (ids.has(rows[i].dataset.id)) rows.splice(i, 1);
    apply();
  });
  const lo = document.getElementById("loadout");
  if (lo) lo.addEventListener("change", () => post({ action: "loadoutView", loadout: lo.value }));
  apply();
</script>
</body></html>`;
}
