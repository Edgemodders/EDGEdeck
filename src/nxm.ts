// nxm:// links: what the "Mod manager download" button on Nexus opens. VS Code cannot register a
// protocol for an extension, so EDGEdeck registers the editor's own exe under the current user's
// classes, opening vscode://edgemodders.edgedeck/nxm?url=<link>, whose URI handler passes it to the
// extension. Registration is explicit, and so is giving the links back.

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
 * The command the registry runs for a link: the editor's exe with --open-url, the way the editor's
 * own vscode:// entry does it, so whatever holds the vscode:// protocol (a test build, another
 * editor) does not matter. The link is one quoted argument and never part of shell code: any web
 * page can open an nxm or edgemods link, and up to 0.32.0 a link with a ' in it could break out of
 * the PowerShell forwarder's quotes and run its own code. The link goes in unencoded; VS Code hands
 * the query over decoded anyway, and linkFromQuery takes everything after url=.
 */
export function linkCommand(target: LinkTarget, path: "nxm" | "edgemods"): string {
  if (!target.exe) throw new Error("EDGEdeck could not find this editor's program, so it cannot take links here.");
  return `"${target.exe}" --open-url -- "${target.scheme ?? UriScheme}://${UriAuthority}/${path}?url=%1"`;
}

/** The command the registry runs for an nxm link. */
export function forwarderCommand(target: LinkTarget): string {
  return linkCommand(target, "nxm");
}

/**
 * EDGEdeck's own registry entry read back: the editor it opens and that editor's link scheme, and
 * whether it is the PowerShell forwarder of 0.27.0 to 0.32.0, which has to be replaced.
 * Undefined for another program's entry.
 */
export function readForwarder(command: string): { exe?: string; scheme?: string; old: boolean } | undefined {
  if (!command.includes(UriAuthority)) return undefined;
  const direct = /^"([^"]+)" --open-url -- "([a-z-]+):\/\//i.exec(command);
  if (direct) return { exe: direct[1], scheme: direct[2], old: false };
  const exe = /-FilePath '((?:[^']|'')+)'/.exec(command)?.[1].replace(/''/g, "'");
  const scheme = /\$u = '([a-z-]+):\/\//i.exec(command)?.[1];
  return { exe, scheme, old: true };
}

const Key = "HKCU\\Software\\Classes\\nxm";

/** Registers EDGEdeck as the handler for nxm links for this user. Returns what handled them before, if known. */
export async function registerNxmHandler(target: LinkTarget): Promise<string | undefined> {
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
// scheme and hands the link to the EDGEmods extension. Registered the same way as nxm links
// (linkCommand).

export const EdgemodsScheme = "edgemods";
const EdgemodsKey = "HKCU\\Software\\Classes\\edgemods";

/** The command the registry runs for an edgemods link. */
export function edgemodsCommand(target: LinkTarget): string {
  return linkCommand(target, "edgemods");
}

/** Registers EDGEdeck for edgemods links, for this user. */
export async function registerEdgemodsHandler(target: LinkTarget): Promise<void> {
  await run("reg", ["add", EdgemodsKey, "/ve", "/d", "URL:EDGEmods link", "/f"], { windowsHide: true });
  await run("reg", ["add", EdgemodsKey, "/v", "URL Protocol", "/d", "", "/f"], { windowsHide: true });
  await run("reg", ["add", `${EdgemodsKey}\\shell\\open\\command`, "/ve", "/d", edgemodsCommand(target), "/f"], { windowsHide: true });
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
