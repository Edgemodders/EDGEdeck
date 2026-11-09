// The FOMOD installer window (layout C of the design): the steps down the left with a mark each,
// the selected step's options on the right with the option's picture and description, Cancel and
// Install at the bottom. One window at a time: a second one waits until the first closes.

import * as vscode from "vscode";
import * as os from "node:os";
import * as path from "node:path";
import fs from "./fsx";
import { installerView, settleChoices, toggleChoice, type FomodConfig, type ResolveContext, type StepChoice, type Warning } from "./fomod";

export interface FomodInstallerOptions {
  /** The mod's name and version. */
  title: string;
  /** For an update: from what version to what, and how much the installer changed. */
  subtitle?: string;
  cfg: FomodConfig;
  root: string;
  choices: StepChoice[];
  warnings: Warning[];
  ctx: ResolveContext;
}

type InstallerMessage =
  | { action: "ready" }
  | { action: "toggle"; step: string; group: string; plugin: string }
  | { action: "install" }
  | { action: "cancel" };

let queue: Promise<unknown> = Promise.resolve();

/** Shows the installer and resolves with the choices on Install, or undefined on Cancel or close. */
export function openFomodInstaller(opts: FomodInstallerOptions): Promise<StepChoice[] | undefined> {
  const shown = queue.then(() => showInstaller(opts));
  queue = shown.catch(() => undefined);
  return shown;
}

const ImageTypes = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"]);
const slashes = (p: string): string => p.replace(/[\\]/g, "/").replace(/^\/+|\/+$/g, "");

/** Copies every option's picture that sits inside the mod into dir; returns them by their installer path (lower case). */
function copyImages(cfg: FomodConfig, root: string, dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const base = path.resolve(root);
  for (const step of cfg.steps) for (const group of step.groups) for (const p of group.plugins) {
    if (!p.image) continue;
    const rel = slashes(p.image);
    const key = rel.toLowerCase();
    if (out.has(key)) continue;
    // The XML is untrusted: only a picture file inside the mod's folder is shown.
    const file = path.resolve(base, ...rel.split("/"));
    const ext = path.extname(file).toLowerCase();
    if (!file.startsWith(base + path.sep) || !ImageTypes.has(ext)) continue;
    try {
      const st = fs.lstatSync(file);
      if (!st.isFile() || st.size > 32 * 1024 * 1024) continue;
      const name = `${out.size}${ext}`;
      fs.copyFileSync(file, path.join(dir, name));
      out.set(key, name);
    } catch {
      /* a missing picture: the option shows without one */
    }
  }
  return out;
}

function showInstaller(opts: FomodInstallerOptions): Promise<StepChoice[] | undefined> {
  return new Promise((resolve) => {
    const { cfg, root, warnings, ctx } = opts;
    const imgDir = fs.mkdtempSync(path.join(os.tmpdir(), "edgedeck-fomod-img-"));
    const panel = vscode.window.createWebviewPanel("edgedeck.fomod", `Install ${opts.title}`, { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(imgDir)],
    });
    const images = copyImages(cfg, root, imgDir);
    let choices = settleChoices(cfg, opts.choices, ctx);
    let done = false;
    const view = () => installerView(cfg, root, choices, warnings, ctx);
    const finish = (result: StepChoice[] | undefined): void => {
      if (done) return;
      done = true;
      resolve(result);
      panel.dispose();
    };
    const post = (): void => {
      const v = view();
      const uri = (img?: string) => {
        const name = img ? images.get(img.toLowerCase()) : undefined;
        return name ? panel.webview.asWebviewUri(vscode.Uri.file(path.join(imgDir, name))).toString() : undefined;
      };
      const steps = v.steps.map((s) => ({ ...s, groups: s.groups.map((g) => ({ ...g, plugins: g.plugins.map((p) => ({ ...p, image: uri(p.image) })) })) }));
      void panel.webview.postMessage({ type: "view", steps, canInstall: v.canInstall });
    };
    panel.webview.onDidReceiveMessage((m: InstallerMessage) => {
      if (done || !m || typeof m !== "object") return;
      switch (m.action) {
        case "ready":
          post();
          break;
        case "toggle": {
          if (typeof m.step !== "string" || typeof m.group !== "string" || typeof m.plugin !== "string") return;
          const p = view().steps.find((s) => s.name === m.step)?.groups.find((g) => g.name === m.group)?.plugins.find((x) => x.name === m.plugin);
          if (!p || p.locked || p.disabled) return post();
          choices = settleChoices(cfg, toggleChoice(cfg, choices, m.step, m.group, m.plugin), ctx);
          post();
          break;
        }
        case "install":
          if (view().canInstall) finish(choices);
          else post();
          break;
        case "cancel":
          finish(undefined);
          break;
      }
    });
    panel.onDidDispose(() => {
      try {
        fs.rmSync(imgDir, { recursive: true, force: true });
      } catch {
        /* the temp folder goes with the next clean-up */
      }
      if (!done) {
        done = true;
        resolve(undefined);
      }
    });
    panel.webview.html = render(opts.title, opts.subtitle, panel.webview.cspSource);
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The window's page. Everything from the installer is put in by the script as text, never as HTML. */
function render(title: string, subtitle: string | undefined, csp: string): string {
  const nonce = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join("");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp}; style-src 'unsafe-inline' ${csp}; script-src 'nonce-${nonce}';">
<style>
:root { --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground); --dim: var(--vscode-descriptionForeground); --line: var(--vscode-widget-border, #262c3d); --yellow: #fcee0a; --cyan: #19f3ff; --green: #5dffa1; --red: #ff2a52; --ink: #0b0d12; }
body.vscode-light, body.vscode-high-contrast-light { --yellow: #7a6a00; --cyan: #00727a; --green: #17803d; --red: #c4002b; --ink: #ffffff; }
html, body { height: 100%; }
body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--fg); background: var(--bg); margin: 0; padding: 14px 20px; box-sizing: border-box; display: flex; flex-direction: column; }
h1 { font-size: 20px; margin: 0; letter-spacing: .02em; text-transform: uppercase; } h1 span { color: var(--yellow); }
.sub { color: var(--dim); margin: 6px 0 0; white-space: pre-line; }
.main { flex: 1; display: grid; grid-template-columns: minmax(160px, 240px) 1fr minmax(200px, 320px); gap: 18px; margin: 14px 0; min-height: 0; }
.main > * { overflow: auto; }
h2 { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--cyan); margin: 0 0 8px; font-weight: 500; }
ul.steps { list-style: none; margin: 0; padding: 0; }
ul.steps li { padding: 6px 8px; border-left: 2px solid transparent; cursor: pointer; display: flex; gap: 8px; }
ul.steps li:hover { color: var(--yellow); }
ul.steps li.sel { border-left-color: var(--yellow); background: color-mix(in srgb, var(--yellow) 8%, transparent); }
.mark { width: 1.2em; text-align: center; } .ok { color: var(--green); } .warn { color: var(--yellow); }
.group { margin-bottom: 16px; } .group .how { color: var(--dim); font-size: 12px; margin-left: 6px; text-transform: none; letter-spacing: 0; }
.opt { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border: 1px solid transparent; cursor: pointer; }
.opt:hover { border-color: var(--line); } .opt.focus { border-color: var(--yellow); }
.opt.disabled { color: var(--dim); cursor: default; } .opt.locked { cursor: default; }
.opt input { accent-color: var(--yellow); width: 15px; height: 15px; margin: 0; pointer-events: none; }
.tag { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; padding: 0 5px; border: 1px solid var(--yellow); color: var(--yellow); }
.tag.dim { border-color: var(--line); color: var(--dim); }
.preview img { max-width: 100%; display: block; margin-bottom: 10px; border: 1px solid var(--line); }
.preview .pname { font-weight: 600; margin-bottom: 6px; } .preview .pdesc { color: var(--dim); white-space: pre-line; }
.foot { display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--line); padding-top: 12px; }
.foot .hint { flex: 1; color: var(--dim); }
button { font: inherit; font-size: 12px; background: transparent; color: var(--fg); border: 1px solid var(--line); padding: 6px 16px; cursor: pointer; }
button:hover { border-color: var(--yellow); color: var(--yellow); }
button.primary { background: var(--yellow); color: var(--ink); border-color: var(--yellow); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
button.primary:hover { background: transparent; color: var(--yellow); }
button:disabled, button.primary:disabled { opacity: .4; cursor: default; background: transparent; color: var(--dim); border-color: var(--line); }
</style></head><body>
<h1>${esc(title)}</h1>
${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}
<div class="main">
  <div><h2>Steps</h2><ul class="steps" id="steps"></ul></div>
  <div id="groups"></div>
  <div class="preview" id="preview"></div>
</div>
<div class="foot"><span class="hint" id="hint"></span><button id="cancel">Cancel</button><button class="primary" id="install" disabled>Install</button></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const How = { SelectExactlyOne: "pick one", SelectAtMostOne: "pick one or none", SelectAtLeastOne: "pick one or more", SelectAny: "pick any", SelectAll: "all of these are installed" };
  let view = { steps: [], canInstall: false };
  let sel = "";
  let focus = undefined;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const step = () => view.steps.find((s) => s.name === sel);

  function preview(p) {
    const box = document.getElementById("preview");
    box.replaceChildren();
    if (!p) return;
    if (p.image) { const img = el("img"); img.src = p.image; img.alt = ""; box.append(img); }
    box.append(el("div", "pname", p.name), el("div", "pdesc", p.description || "No description."));
  }
  function restingPreview() {
    const s = step();
    if (!s) return preview(undefined);
    const all = s.groups.flatMap((g) => g.plugins);
    preview(all.find((p) => focus && p.name === focus.plugin && s.name === focus.step) || all.find((p) => p.checked) || all[0]);
  }

  function render() {
    if (!view.steps.some((s) => s.name === sel)) sel = (view.steps.find((s) => s.mark === "warn") || view.steps[0] || { name: "" }).name;
    const list = document.getElementById("steps");
    list.replaceChildren(...view.steps.map((s) => {
      const li = el("li", s.name === sel ? "sel" : "");
      li.append(el("span", "mark " + s.mark, s.mark === "ok" ? "\\u2713" : "\\u26a0"), el("span", "", s.name));
      li.title = s.mark === "ok" ? "Has a valid choice" : "New or changed, or still needs a pick";
      li.addEventListener("click", () => { sel = s.name; render(); });
      return li;
    }));
    const box = document.getElementById("groups");
    box.replaceChildren();
    const s = step();
    if (s) {
      box.append(el("h2", "", s.name));
      for (const g of s.groups) {
        const gd = el("div", "group");
        const head = el("h2", "", g.name);
        head.append(el("span", "how", How[g.type] || ""));
        gd.append(head);
        const radio = g.type === "SelectExactlyOne" || g.type === "SelectAtMostOne";
        for (const p of g.plugins) {
          const row = el("div", "opt" + (p.disabled ? " disabled" : "") + (p.locked ? " locked" : "") + (focus && focus.step === s.name && focus.group === g.name && focus.plugin === p.name ? " focus" : ""));
          const input = el("input");
          input.type = radio ? "radio" : "checkbox";
          input.checked = p.checked;
          input.disabled = p.disabled || p.locked;
          input.tabIndex = -1;
          row.append(input, el("span", "", p.name));
          if (p.isNew) row.append(el("span", "tag", "new"));
          if (p.locked && g.type !== "SelectAll") row.append(el("span", "tag dim", "required"));
          if (p.disabled) row.append(el("span", "tag dim", "not usable"));
          row.title = p.disabled ? "Not usable with the mods that are on" : p.locked ? "The installer always puts this in" : "";
          row.addEventListener("mouseenter", () => preview(p));
          row.addEventListener("mouseleave", restingPreview);
          row.addEventListener("click", () => {
            focus = { step: s.name, group: g.name, plugin: p.name };
            if (!p.disabled && !p.locked) vscode.postMessage({ action: "toggle", step: s.name, group: g.name, plugin: p.name });
            else render();
          });
          gd.append(row);
        }
        box.append(gd);
      }
    }
    restingPreview();
    document.getElementById("install").disabled = !view.canInstall;
    document.getElementById("hint").textContent = view.canInstall ? "Install puts in the options of every step listed." : "A step marked \\u26a0 still needs a pick.";
  }

  window.addEventListener("message", (e) => { if (e.data && e.data.type === "view") { view = e.data; render(); } });
  document.getElementById("cancel").addEventListener("click", () => vscode.postMessage({ action: "cancel" }));
  document.getElementById("install").addEventListener("click", () => vscode.postMessage({ action: "install" }));
  vscode.postMessage({ action: "ready" });
</script>
</body></html>`;
}
