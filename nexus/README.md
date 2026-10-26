# EDGEdeck on Nexus Mods

The source of EDGEdeck's Nexus Mods page lives here, so updates are edits in the repo, not in Nexus's text box.

Since 2026-10-26 the page is kept through Nexus's v3 API, as REDnode's, EDGEmat's and EDGEchat's are: `tools/nexus/` (copied from REDnode; keep the copies the same) and `nexus.json` (the page, and how a release uploads: Mod Manager Download off, the old version archived). The release workflow's **Update Nexus Mods** box uploads the Nexus zip, adds the changelog and pushes `description.bbcode`. Until `nexus.json` names the page (`"page": <number>`, then `node tools/nexus/nexus.mjs pull`), a run with that box ticked stops before it builds.

| File | What it is |
|---|---|
| `description.bbcode` | The page's description, in Nexus's BBCode |
| `README.md` | This page: the other fields of the Nexus form, the download file, and how to update |
| `nexus.json` | The page, its internal mod id and main file (written by `pull`), how a release uploads, and the hash of the description last pulled |

## The Nexus form

| Field | Value |
|---|---|
| Mod name | EDGEdeck |
| Version | EDGEdeck's version, from `package.json` (for example 0.27.3) |
| Category | Utilities (check the list for Cyberpunk 2077 when creating the page) |
| Brief overview | A simple mod manager for Cyberpunk 2077 inside VS Code: add, on or off, deploy, remove. Hardlink deploys you can undo, conflicts inside archives, Nexus sign-in and updates, loadouts, Vortex import. A VS Code extension, not a game mod. (255 characters at most; this is 234) |
| Author | Edgemodders |
| Language | English |
| Primary image | `docs/assets/brand/social.png` (1280 x 640). The banner (`docs/assets/brand/banner.png`) is already at the top of the description |
| Requirements | None on Nexus. Off-site: VS Code 1.80 or later (or VSCodium, or EDGEkit) |
| Permissions | MIT: open source, free to modify and redistribute with the license notice. 7-Zip's 7za.exe keeps its GNU LGPL license (`ThirdPartyNotices.txt`) |
| Tags | Utility, mod manager, modders resource |

The description's pictures are already uploaded to the page's Images tab and linked by their Nexus URLs (`staticdelivery.nexusmods.com`); local copies are in `nexus/images/`. To add or replace one, upload the picture to the Images tab, then put `[img]<the image's Nexus URL>[/img]` and a one-line caption in the description.

## The download

One main file: `EDGEdeck-<version>-nexus.zip`, with:

| File | What it is |
|---|---|
| `edgedeck-<version>.vsix` | The extension, the same file the Marketplace and Open VSX have |
| `README.txt` | How to install it: Install from VSIX in VS Code, or `code --install-extension` |
| `LICENSE.txt`, `ThirdPartyNotices.txt` | EDGEdeck's license and 7-Zip's |

**When uploading, turn off the Mod Manager Download button** for this file (Nexus's file form has the option). It is a VS Code extension: Vortex would deploy it into the game folder, where it does nothing.

File description on Nexus:

> EDGEdeck &lt;version&gt;, the VS Code extension. Extract, then in VS Code: Extensions view, ..., Install from VSIX. Or install it from the Marketplace or Open VSX, where it updates itself.

### Building it

The release workflow (`.github/workflows/release.yml`) builds it with every release and attaches it to the GitHub release, beside the `.vsix`. A release: bump the version, give it its CHANGELOG.md section, push, then run **Release** from the Actions tab with **Make a release** ticked (or `npm run release`). Tick **Update Nexus Mods** too to upload it to Nexus (below).

By hand, after `npm run package`: `node scripts/nexus-zip.mjs` writes `dist/EDGEdeck-<version>-nexus.zip`.

## Updating the page

1. Edit `description.bbcode` here, check it with `node scripts/check-bbcode.mjs nexus/description.bbcode`, commit, push.
2. With a release: tick **Update Nexus Mods** beside **Make a release** (or `npm run release:nexus`). After the GitHub release the workflow uploads `EDGEdeck-<version>-nexus.zip` as the main file's new version (the old one archived, Mod Manager Download off), adds the version's changelog (`npm run release:notes -- --nexus`) and pushes `description.bbcode` when it differs from the live one.
3. The push never overwrites an edit made on Nexus: if the live description is neither the one last pulled nor the one the previous release pushed, the run stops before it builds. Then `node tools/nexus/nexus.mjs pull`, merge with `git diff`, commit, and run again. `node tools/nexus/nexus.mjs status` shows the page's version, files and whether its description matches.
4. Screenshots uploaded on Nexus show in the description as `staticdelivery.nexusmods.com` links; keep them when editing.

The key: in CI the organisation secret `NEXUS_KEY`; on the dev PC the DPAPI file `%APPDATA%\Edgemodders\nexus-key.txt` (`tools/nexus/api.mjs`). Never print it or pass it on a command line.

Keep these in step with the extension (docs/marketplace.md, CHANGELOG.md):

| Where in the description | Update when |
|---|---|
| The STATUS box near the top | The preview flag goes, or what is in daily use changes |
| "Highlights" | A release adds something a player would notice |
| "Requirements" | The VS Code minimum (`engines.vscode`) changes |

## BBCode used

Nexus's BBCode has no tables or Markdown, so the page uses only: `[b]`, `[i]`, `[size=2..5]`, `[color=#hex]`, `[center]`, `[quote]`, `[line]`, `[list]` with `[*]`, `[url=...]` and `[img]`. The banner is linked from this repo's `main` branch on GitHub, so it must stay at its path. The colours are the house palette: yellow `#fcee0a` for headings, cyan `#19f3ff` for highlights.
