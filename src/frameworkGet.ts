// Get the frameworks: RED4ext, CET, redscript, ArchiveXL, TweakXL and Codeware, from their authors'
// GitHub releases. Each author publishes every release there as well as on Nexus, at the same version,
// and GitHub needs no account, so this works for every player. Each mod keeps its Nexus id, so it joins
// the same family as a Nexus download of that framework and the Nexus update check still sees it.

import { families, type Family } from "./families";
import type { Library } from "./library";
import { versionNewer } from "./nexus";

export interface FrameworkSource {
  name: string;
  nexusId: number;
  repo: string;
  /** The release asset to take (not the debug symbols). */
  asset: RegExp;
  /** A file only this framework deploys, to recognise it in a mod that has no Nexus id. */
  signature: string;
}

/** The six, in the order a player would read them. Asset names checked against the releases of 2026-10-22. */
export const FrameworkSources: FrameworkSource[] = [
  { name: "RED4ext", nexusId: 2380, repo: "WopsS/RED4ext", asset: /^red4ext-[\d.]+\.zip$/i, signature: "red4ext/RED4ext.dll" },
  { name: "Cyber Engine Tweaks", nexusId: 107, repo: "maximegmd/CyberEngineTweaks", asset: /^cet_[\d_]+\.zip$/i, signature: "bin/x64/plugins/cyber_engine_tweaks.asi" },
  { name: "redscript", nexusId: 1511, repo: "jac3km4/redscript", asset: /^redscript-v?[\d.]+-windows\.zip$/i, signature: "engine/tools/scc.exe" },
  { name: "ArchiveXL", nexusId: 4198, repo: "psiberx/cp2077-archive-xl", asset: /^ArchiveXL-[\d.]+\.zip$/i, signature: "red4ext/plugins/ArchiveXL/ArchiveXL.dll" },
  { name: "TweakXL", nexusId: 4197, repo: "psiberx/cp2077-tweak-xl", asset: /^TweakXL-[\d.]+\.zip$/i, signature: "red4ext/plugins/TweakXL/TweakXL.dll" },
  { name: "Codeware", nexusId: 7780, repo: "psiberx/cp2077-codeware", asset: /^Codeware-[\d.]+\.zip$/i, signature: "red4ext/plugins/Codeware/Codeware.dll" },
];

export interface FrameworkRelease {
  version: string;
  tag: string;
  assetName: string;
  url: string;
  size: number;
  page: string;
}

export interface FrameworkState {
  source: FrameworkSource;
  /** The family in the library, when it has this framework. */
  family?: Family;
  /** The newest release on GitHub, when the lookup worked. */
  release?: FrameworkRelease;
  /** Why the lookup did not work. */
  error?: string;
  /** Missing from the library, or the library's newest version is older than the release. */
  wanted: boolean;
}

/** The library's family for a framework: by its Nexus id, else by its signature file. */
export function frameworkFamily(lib: Library, f: FrameworkSource): Family | undefined {
  const sig = f.signature.toLowerCase();
  return families(lib).find((fam) => fam.nexusId === f.nexusId || fam.mods.some((m) => m.files.some((x) => x.toLowerCase() === sig)));
}

/** The frameworks the library has none of. */
export function missingFrameworks(lib: Library): FrameworkSource[] {
  return FrameworkSources.filter((f) => !frameworkFamily(lib, f));
}

type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** The newest GitHub release of a framework and its zip. `api` and `fetchImpl` are for tests. */
export async function latestFrameworkRelease(f: FrameworkSource, fetchImpl: Fetch = fetch as unknown as Fetch, api = "https://api.github.com"): Promise<FrameworkRelease> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "EDGEdeck" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetchImpl(`${api}/repos/${f.repo}/releases/latest`, { headers });
  if (!res.ok) throw new Error(res.status === 403 ? "GitHub's limit for calls without an account was reached; try again within the hour." : `GitHub answered ${res.status}.`);
  const rel = (await res.json()) as { tag_name: string; html_url: string; assets: { name: string; browser_download_url: string; size: number }[] };
  const asset = rel.assets.find((a) => f.asset.test(a.name));
  if (!asset) throw new Error(`release ${rel.tag_name} has no file named like ${f.asset.source}.`);
  return { version: rel.tag_name.replace(/^v/i, ""), tag: rel.tag_name, assetName: asset.name, url: asset.browser_download_url, size: asset.size, page: rel.html_url };
}

/** Every framework with what the library has and what GitHub has. Lookups run side by side. */
export async function frameworkStates(lib: Library, fetchImpl?: Fetch, api?: string): Promise<FrameworkState[]> {
  return Promise.all(
    FrameworkSources.map(async (source) => {
      const family = frameworkFamily(lib, source);
      try {
        const release = await latestFrameworkRelease(source, fetchImpl, api);
        const newest = family?.mods[0]?.version ?? "";
        // A version the library does not know (an import without one) is not called outdated.
        return { source, family, release, wanted: !family || (!!newest && versionNewer(release.version, newest)) };
      } catch (err) {
        return { source, family, error: err instanceof Error ? err.message : String(err), wanted: !family };
      }
    }),
  );
}
