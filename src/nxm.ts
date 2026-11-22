// nxm:// links: what the "Mod manager download" button on Nexus opens. VS Code cannot register a
// protocol for an extension, so EDGEdeck registers a small PowerShell forwarder under the current
// user's classes that hands vscode://edgemodders.edgedeck/nxm?url=<link> to the editor it runs in,
// whose URI handler passes it to the extension. Registration is explicit, and so is giving the
// links back.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const UriScheme = "vscode";
export const UriAuthority = "edgemodders.edgedeck";

export interface NxmLink {
  game: string;
  modId: number;
  fileId: number;
  key?: string;
  expires?: number;
  userId?: number;
}

/**
 * The nxm link inside the query of the vscode:// link the forwarder opens. VS Code hands the query
 * over decoded, so the link's own & look like more parameters of ours: everything after `url=` is
 * the link. A query that is still encoded is decoded once.
 */
export function nxmFromQuery(query: string): string | undefined {
  return linkFromQuery(query, "nxm");
}

/** The link of the given scheme inside the query of a vscode:// link, as nxmFromQuery. */
export function linkFromQuery(query: string, scheme: string): string | undefined {
  const i = query.indexOf("url=");
  if (i < 0) return undefined;
  const value = query.slice(i + "url=".length);
  return new RegExp(`^${scheme}%3A`, "i").test(value) ? decodeURIComponent(value) : value || undefined;
}

/** Parses nxm://cyberpunk2077/mods/123/files/456?key=...&expires=...&user_id=... */
export function parseNxm(link: string): NxmLink {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error(`Not a link: ${link}`);
  }
  if (url.protocol !== "nxm:") throw new Error(`Not an nxm link: ${link}`);
  const m = /^\/mods\/(\d+)\/files\/(\d+)/.exec(url.pathname);
  if (!m) throw new Error(`Not a mod file link (collections are not supported): ${link}`);
  const expires = url.searchParams.get("expires");
  const userId = url.searchParams.get("user_id");
  return {
    game: url.hostname.toLowerCase(),
    modId: Number(m[1]),
    fileId: Number(m[2]),
    key: url.searchParams.get("key") ?? undefined,
    expires: expires ? Number(expires) : undefined,
    userId: userId ? Number(userId) : undefined,
  };
}

/** The editor links go to: its exe, and its own link scheme (vscode, vscode-insiders, cursor, vscodium). */
export interface LinkTarget {
  exe?: string;
  scheme?: string;
}

/**
 * The command the registry runs for an nxm link: forward it to the editor, percent-encoded. With an
 * exe, the link goes straight to that exe's --open-url, the way the editor's own protocol entry does
 * it, so whatever holds the vscode:// protocol (a test build, another editor) does not matter. The
 * link goes in single quotes inside the PowerShell code: -Command joins its arguments into code, and
 * the & between a link's query parameters is a parse error there. Nexus links have no quotes.
 */
export function forwarderCommand(target: LinkTarget = {}): string {
  const url = `$u = '${target.scheme ?? UriScheme}://${UriAuthority}/nxm?url=' + [uri]::EscapeDataString('%1')`;
  const open = target.exe ? `Start-Process -FilePath '${target.exe.replace(/'/g, "''")}' -ArgumentList '--open-url','--',$u` : "Start-Process $u";
  return `powershell.exe -NoProfile -WindowStyle Hidden -Command "${url}; ${open}"`;
}

/** The editor exe a forwarder sends links to, if it names one. */
export function forwarderExe(command: string): string | undefined {
  return /-FilePath '((?:[^']|'')+)'/.exec(command)?.[1].replace(/''/g, "'");
}

const Key = "HKCU\\Software\\Classes\\nxm";

/** Registers EDGEdeck as the handler for nxm links for this user. Returns what handled them before, if known. */
export async function registerNxmHandler(target: LinkTarget = {}): Promise<string | undefined> {
  const before = await currentNxmHandler();
  await run("reg", ["add", Key, "/ve", "/d", "URL:Nexus Mods link", "/f"], { windowsHide: true });
  await run("reg", ["add", Key, "/v", "URL Protocol", "/d", "", "/f"], { windowsHide: true });
  await run("reg", ["add", `${Key}\\shell\\open\\command`, "/ve", "/d", forwarderCommand(target), "/f"], { windowsHide: true });
  return before;
}

/** Removes EDGEdeck's registration. Vortex re-registers itself when it starts, if the user wants it back. */
export async function unregisterNxmHandler(): Promise<void> {
  if ((await currentNxmHandler())?.includes(UriAuthority)) {
    await run("reg", ["delete", Key, "/f"], { windowsHide: true });
  }
}

/** Why the last currentNxmHandler() found nothing, for the log. */
export let nxmReadError = "";

/** The command currently registered for nxm links, or undefined. */
export async function currentNxmHandler(): Promise<string | undefined> {
  nxmReadError = "";
  try {
    const { stdout } = await run("reg", ["query", `${Key}\\shell\\open\\command`, "/ve"], { windowsHide: true });
    const m = /REG_SZ\s+(.+)$/m.exec(stdout);
    if (!m) nxmReadError = `no value in: ${JSON.stringify(stdout).slice(0, 200)}`;
    return m?.[1].trim();
  } catch (err) {
    nxmReadError = (err as Error).message;
    return undefined;
  }
}

// ---- edgemods:// links: the "Mod manager" button on a mod's page on EDGEmods (EDGEdeck#16) ----
//
// edgemods://install/<mod>/<version>, with the mod's id and the release; EDGEdeck reads only the
// scheme and hands the link to the EDGEmods extension. Any web page can open one, so the link never
// goes into shell code: the registry runs the editor's exe with --open-url, as VS Code's own
// vscode:// entry does, and the link is one quoted argument. EDGEmods' links have no query, so they
// need no encoding inside ours.

export const EdgemodsScheme = "edgemods";
const EdgemodsKey = "HKCU\\Software\\Classes\\edgemods";

/** The command the registry runs for an edgemods link: the editor's exe, opening ours. */
export function edgemodsCommand(exe: string, scheme = UriScheme): string {
  return `"${exe}" --open-url -- "${scheme}://${UriAuthority}/edgemods?url=%1"`;
}

/** The editor exe an edgemods command opens, if it is EDGEdeck's. */
export function edgemodsExe(command: string): string | undefined {
  return command.includes(UriAuthority) ? /^"([^"]+)" --open-url/.exec(command)?.[1] : undefined;
}

/** Registers EDGEdeck for edgemods links, for this user. */
export async function registerEdgemodsHandler(exe: string, scheme = UriScheme): Promise<void> {
  await run("reg", ["add", EdgemodsKey, "/ve", "/d", "URL:EDGEmods link", "/f"], { windowsHide: true });
  await run("reg", ["add", EdgemodsKey, "/v", "URL Protocol", "/d", "", "/f"], { windowsHide: true });
  await run("reg", ["add", `${EdgemodsKey}\\shell\\open\\command`, "/ve", "/d", edgemodsCommand(exe, scheme), "/f"], { windowsHide: true });
}

/** Removes EDGEdeck's registration for edgemods links; another program's is left alone. */
export async function unregisterEdgemodsHandler(): Promise<void> {
  if ((await currentEdgemodsHandler())?.includes(UriAuthority)) {
    await run("reg", ["delete", EdgemodsKey, "/f"], { windowsHide: true });
  }
}

/** The command currently registered for edgemods links, or undefined. */
export async function currentEdgemodsHandler(): Promise<string | undefined> {
  try {
    const { stdout } = await run("reg", ["query", `${EdgemodsKey}\\shell\\open\\command`, "/ve"], { windowsHide: true });
    return /REG_SZ\s+(.+)$/m.exec(stdout)?.[1].trim();
  } catch {
    return undefined;
  }
}

export function describeHandler(command: string | undefined): string {
  if (!command) return "nobody";
  if (command.includes(UriAuthority)) return "EDGEdeck";
  if (/vortex/i.test(command)) return "Vortex";
  if (/modorganizer|nxmhandler/i.test(command)) return "Mod Organizer";
  return command.slice(0, 60);
}
