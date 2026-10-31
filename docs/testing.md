---
title: Tests
---

# <span class="y">Tests</span>

Every test run on EDGEdeck so far: how to run it again, what to expect, and what it showed. The automated tests run on every release; the hand tests are the owner's, on the laptop and on the owner's PC (game on `E:`). New tests are added here when they are first run.

Releases up to 0.26.6 were published as REDdeck; this page uses the new name throughout.

Last updated 2026-10-26. Dates before 2026-10-17 come from the session records; anything not confirmed there is marked unverified.

## At a glance

| Test | Kind | Last run | Result |
|---|---|---|---|
| [Type check and build](#type-check-and-build) | Automated, every release | 2026-10-26 (0.29.0) | Pass |
| [Smoke test](#smoke-test) | Automated, every release | 2026-10-26 (0.29.0) | Pass |
| [UI test](#ui-test-in-a-real-vs-code) | Automated, by hand only (not in CI) | 2026-10-25 (`main` before 0.29.0) | Pass |
| [Release workflow](#release-workflow) | Automated, Run workflow from the Actions tab | 2026-10-26 (v0.29.0) | Pass on the third attempt |
| [npm package install](#npm-package-install) | By hand | 2026-10-16 (0.26.5) | Pass |
| [Hand tests by the owner](#hand-tests-by-the-owner) | By hand, real game | 2026-10-26 | 35 runs, see the table |
| [Waiting](#waiting-for-a-hand-test) | By hand | | 12 open |

## Automated

### Type check and build

```powershell
npm install
npm run typecheck
npm run build
```

`typecheck` is `tsc --noEmit`. `build` bundles `dist/extension.js`, `core.js`, `mcp.js` and `uiTest.js` with esbuild and writes ThirdPartyNotices.txt. Expected: no errors.

### Smoke test

```powershell
npm run build
npm run smoke
```

`scripts/smoke.mjs` runs the core end to end against a fake game folder in a temp directory. It never touches a real library or game. Expected: ends with `smoke: all passed`.

| Area | Checks |
|---|---|
| Classifier | Bare archive (readme ignored), mixed archive, reds, tweak and xl, a CET folder, option folders as a choice, REDnode packages in three layouts (and REDnode itself as a framework), loose `.reds`, RED4ext plugin, REDmod, frameworks |
| Library and deploy | Extract a zip with 7za and add it; a conflict won by order; hardlinks (7 linked, none skipped); the deploy report (mods counted, paths, the load order files section); a single `.archive` goes to `archive/pc/mod` and in and out of `modlist.txt`; a second deploy does nothing; a reorder replaces the file |
| Outside changes | A changed file is skipped until answered, Keep imports it and relinks, a missing file comes back; a rebuilt mod relinks silently |
| Projects | Find the `.cpmodproj`, its packed files, re-sync; `installProject` adds as version dev, then refreshes in place and keeps its slot; beside a mod of the same name: separate (and `lostFiles` names it the loser), Keep both (`dev 2`, one family, on in its place), Use this project (the old mod follows the new folder, family key kept) |
| Families and order | Versions newest first, update, switch version, a new version takes the old one's place, two on in a family found; place above; sections (add, order, move, rename, delete, the section box) |
| Loadouts | Version 1 save and load; Default from the current state, sync writes once, new, edit without touching mods, Make active both ways, the active one cannot be deleted, rename, export, import, delete |
| CLI and MCP | `edgedeck list --json`, off and on, conflicts, loadouts, deploy, changes, mod; the MCP server over stdio through the SDK's client (list, turn off reaches the files, pending, a bad id is an error, the tool count) |
| Off and Undo | Files and created folders leave; Undo puts a backed-up foreign file back and keeps the user's own files |
| Game | Archive conflict maths; REDmod's enabled list; finding the game through Steam libraries, GOG and Epic; the game version from a real install if present |
| REDbridge | A build next to the checkout is new enough and `archive.openMod` lists a sample (skipped if absent); the latest GitHub release has a `win-x64.zip` (skipped offline); `dotnet10Root` |
| Nexus | Single sign-on against a fake socket; OAuth with PKCE against a fake HTTP Nexus (state, code exchange, refusal, cancel, refresh, the user from the token, a 401 renewed once); nxm parsing, versions, newest file, the link handler; the registered forwarder run as Windows runs it, with a link that has `&` between its parameters |
| Add to Project | Loose files under `source/resources`, archives reported, a repeat counted as same, a changed file kept unless Replace |
| Frameworks | Game version against the manifest, the summary line |
| Vortex | Staging folders (user's choice first, the manifest's stagingPath, other drives), display names (CET by Nexus id 107); the live Vortex library if installed, imported read-only into the temp library |

Not covered: the running-game check (`gameRunning()`, 0.26.3), checked only as "not running" on the laptop.

### UI test in a real VS Code

```powershell
npm run build
npm run test:ui
```

Downloads a VS Code build into `.vscode-test/` once (about 350 MB), then runs `src/uiTest.ts` inside it with a scratch library and a fake game. Expected: `ui test: passed`. Not part of the release workflow.

| Check | Expected |
|---|---|
| Activation | `edgemodders.edgedeck` activates |
| Commands | The 38 it lists are registered |
| Library | Created on refresh |
| Deploy | A hand-made mod deploys without a dialog: the archive in the game, a manifest, `modlist.txt` reading `UiTest.archive` |
| Views | Check conflicts opens Conflicts, Show changes opens Pending changes, Open page opens EDGEdeck, Details opens |

### Release workflow

Run **Release** from the Actions tab with **Make a release** ticked (or `npm run release`). Unticked, it stops after packaging and keeps the `.vsix` and the Nexus zip as the run's artifact. `.github/workflows/release.yml` (`publish.yml` before 2026-10-22, when a pushed tag also released) checks the version is not released yet and the run is on main, stops when CHANGELOG.md has no section for it, runs typecheck, build and smoke, packages for win32-x64, builds the Nexus zip, publishes to the VS Code Marketplace and Open VSX, publishes `@edgemodders/edgedeck-mcp` to npm (skipped if that version exists), and makes the GitHub release, which makes the tag when there is none. `verify-tokens.yml`, run by hand, checks the store tokens.

| Run | Result |
|---|---|
| v0.26.0 (10-14), v0.26.1 (10-15), v0.26.2, v0.26.3 (10-16) | Pass |
| v0.26.4 (10-16) | **Failed at npm**: `npm publish dist/npm` was read as a GitHub repo; it needs `./dist/npm`. The extension reached both stores; the GitHub release was made by hand |
| v0.26.5 (10-16) | Pass, npm included |
| v0.26.6 (10-16) | Pass, the first with the Nexus zip (`EDGEdeck-0.26.6-nexus.zip` on the release) |
| v0.27.3 (10-17) | Pass: the first release as EDGEdeck, on the Marketplace, Open VSX and npm (from the session records; the run itself unverified) |
| Run workflow, unticked (10-22) | Pass: built and tested, `.vsix` and Nexus zip kept as the run's artifact, nothing published, no tag |
| v0.29.0 (10-26), with Update Nexus Mods | The stores published, then **npm failed**: `E404` on the PUT (the `NPM_TOKEN` no longer valid), then `EOTP` with a new token without Bypass 2FA. With a token that bypasses 2FA, Re-run failed jobs passed: the stores skipped 0.29.0, npm, the GitHub release, and Nexus (zip as the main file's new version, 0.28.0 archived, changelog, description pushed). The first release to reach Nexus from the workflow |
| v0.28.0 (10-22), Run workflow with Make a release | Pass, the first from the Actions tab: Marketplace, Open VSX, npm and the GitHub release, tag made on the commit. A first try stopped at the changelog check (still Unreleased), as meant. npm showed it within a minute, Open VSX after about 4, the Marketplace after about 7 |
| verify-tokens (10-14) | Pass on the last of four runs (one failure, cause not recorded) |

### npm package install

By hand, not scripted. Install the published `@edgemodders/edgedeck-mcp` into an empty folder, start `edgedeck-mcp --library <scratch>` through an MCP client, and run `edgedeck list --json --library <scratch>`.

Run 2026-10-16 on 0.26.5: **pass**. The server answered with 14 `edgedeck_*` tools and a `edgedeck_list` call; the CLI ran.

## Hand tests by the owner

| Date | Version | Where | Tested | Result, and what came of it |
|---|---|---|---|---|
| 10-12 | 0.7.0 | Laptop | Purging Vortex before the first deploy | Vortex reported a missing .NET runtime: a user-level `DOTNET_ROOT` from the REDbridge setup. Removed; **0.7.1** sets it for REDbridge only |
| 10-12 | 0.7.1 | Laptop | **First real deploy** | 358 files (357 hardlinks and `modlist.txt`), 17 mods with RED4ext, redscript, ArchiveXL, Codeware, CET; no outside changes; one conflict (`BackstoryManager.reds`). Led to the Conflicts panel in **0.8.0**. The game's own launch afterwards: unverified |
| 10-12 | 0.8.0 to 0.8.2 | Laptop | Show conflicts | "Works well." Dropdowns (**0.8.1**, "Looks good") and Deploy now (**0.8.2**) on request |
| 10-12 | 0.7 to 0.9 | Laptop | Nexus with a pasted API key | Key validated; the update check ran on 13 mods with Nexus ids (Codeware 1.20.3 to 1.20.5 offered) |
| 10-12 | 0.9.0, 0.9.1 | Laptop | The mods table page | "Looks good"; the framework chip first (**0.9.1**); a doubled "update available" fixed and update from the row added (**0.9.2**) |
| 10-12 | 0.9.2 | Laptop | Update from a live Nexus download | Downloaded several times, a row each. **0.10.0**: one row per mod with a version dropdown |
| 10-12 | 0.10.0 | Laptop | Switch back to an older Codeware | "Looks good", but Deploy said 18 changes. **0.10.1** counts paths: 9 |
| 10-13 | 0.11.0, 0.12.0 | PC | VSIX install, Get REDbridge | "Seemed to complete successfully" (REDbridge 0.4.0). Telling whether it ran led to the footer status (**0.13.1**) |
| 10-13 | 0.12.0 to 0.13.2 | PC | Finding a Steam game on `E:` | Not found. **0.13.0** reads Steam's library list, GOG and Epic; **0.13.2** logs what was checked. After clearing `edgedeck.gamePath` and reloading, found through Steam |
| 10-13 | 0.14.0 (unverified which) | PC | The build sent just before | "All looks good" |
| 10-13 | 0.17.x | PC | F5 from source | The build task failed after a pull: dependencies missing. `npm install` fixed it |
| 10-14 | 0.20.0 | PC | **REDnode package kind**: EDGEbuilder added and deployed, after all Vortex mods were purged | Worked: `red4ext\plugins\REDnode\apps\edgebuilder\rednode-app.json` in place |
| 10-14 | 0.20.0 | PC | Import from Vortex | "No Vortex mods were found": staging was on `E:`. **0.20.1** reads Vortex's stagingPath and other drives, and asks. RED4ext, redscript and Codeware were then re-added through EDGEdeck, and EDGEbuilder B1 passed in game that night |
| 10-14 | 0.21.0 | PC | Conflicts with EDGEbuilder 0.2.0 beside 0.1.1 | Every picker said "Resolve...": two versions both on, not one family. **0.21.1**: a new version takes the old one's place, one row per mod pair, Use only |
| 10-14 | 0.23.0 | PC | Sections, the section box, icon actions, resizable columns | "Looks good"; the yellow icons "too loud": grey with hover in **0.23.1** |
| 10-14 | 0.24.0 | PC | Folding sections | "Works great." |
| 10-14 | 0.25.0 test build | PC | Import from Vortex (TweakXL) | Everything pre-ticked, and a search hid over 900 ticked mods, so all imported and it looked hung. **0.25.0**: nothing ticked, progress with Cancel, a question above 20; section-wide Put in section and Remove on request |
| 10-14 | 0.25.0, 0.25.1 | PC | The section buttons | Not shown: VS Code kept the earlier build of the same version. Rebuilt as **0.25.1**, "It works now." Since then every build sent gets its own version |
| 10-14 | 0.25.1, 0.25.2 | PC | Deploying 6 mods | The toast gave files but no mods. **0.25.2** counts mods and adds View report: "It works very well." |
| 10-15 | 0.26.0 | PC | Adding a single `.archive`, then deploy | A single file could not be added, and `modlist.txt` was not updated. **0.26.1** fixes both; the fix not yet reported (below) |
| 10-16 | 0.26.1 | PC | Import from Vortex, search "Cyber Engine Tweaks" | Not found: named after its download. **0.26.2**: known names by Nexus id, a wider search. Not yet reported back (below) |
| 10-16 | 0.26.2 | PC | Turn a mod off, add an `.archive`, deploy | `EPERM` on the archive: the game was running. **0.26.3** waits for the game to close, the CLI refuses, a locked file gets a plain message |
| 10-16 | 0.26.3 or later | PC | Deploying EDGEbuilder 0.3.2 and 0.3.3 for its tests | Deployed; EDGEbuilder's retest passed. Nothing EDGEdeck-specific reported |
| 10-17 | 0.27.0 test build | PC | The switch to EDGEdeck: every mod off and deployed in REDdeck, REDdeck uninstalled, EDGEdeck installed from the .vsix and set up from nothing, mods added again and deployed | Worked. The empty Mods view had no Handle download links button (the step showed only in the Set up group of a non-empty list): **0.27.1** adds it to the welcome view |
| 10-17 | 0.27.0 test build | PC | A "Mod manager download" button on Nexus, after Handle download links | A console window flashed, then nothing. The registered PowerShell forwarder took the link as code, and the `&` between its parameters is a parse error there; this was so since nxm links came in (0.7). **0.27.1** quotes the link, rewrites an older EDGEdeck registration by itself, and logs each link it receives; the smoke test now runs the forwarder |
| 10-17 | 0.27.1 test build | PC | Start EDGEdeck with 0.27.0's registration in place | No "updated EDGEdeck's handler" line, and the registry kept the old command. The startup read stored its answer in a state object that `refresh()` had just replaced, so EDGEdeck never knew who handled the links at start (since REDdeck). **0.27.2** keeps the answer, and logs its version and where links go; on the laptop, with the old command written in, a real VS Code run logged "from an older build" and rewrote it |
| 10-17 | 0.27.2 test build | PC | A "Mod manager download" button on Nexus | The log said `Nexus link received` and showed the rewrite at start, then `Nexus: 422 ... Invalid parameter 'expires' value nil`. VS Code decodes the vscode:// query, so the nxm link's own `&` split it and only `?key=` came through (the UI test showed the old reading giving `...?key=a-b_c`). **0.27.3** takes everything after `url=`; smoke and UI tests check it |
| 10-17 | 0.27.3 test build | PC | A "Mod manager download" button on Nexus | **Passed.** The log showed the whole link (`key`, `expires`, `user_id`), and the file downloaded into the library as a new mod. The first real nxm test since links came in (0.7) |
| 10-17 | 0.27.3 | PC | The four waiting tests that need no project: loadouts (0.26.0), `modlist.txt` with a bare `.archive` (0.26.1), deploy with the game running (0.26.3), CET's known name in Import from Vortex (0.26.2) | **Passed.** A copied loadout changed nothing in the sidebar until made active, and its deploy removed the files of the mods turned off; a bare archive landed in `modlist.txt`; with the game open, Deploy showed the modal with **The game is closed now**; clicked with the game still running (twice) it came back and nothing deployed, and after quitting the game, clicking it deployed (EDGEdeck checks again only on the click); "CET" and "107" found Cyber Engine Tweaks |
| 10-17 | 0.27.3 | PC | The leftovers: light theme, Suggest the HUD theme, Undo deploy on the real game, the MCP server from an assistant | **Passed.** Readable in Light+; the theme suggestion offered the HUD theme; Undo deploy removed every deployed file; after Connect an assistant, the assistant answered "9 mods, 8 on, none deployed yet", true after the Undo, so it read the library and the game folder's manifest. Found: the command palette showed "EDGEdeck: EDGEdeck: Connect an assistant (MCP)..." (title and category both said EDGEdeck); fixed for the next build |
| 10-17 | 0.27.3 | PC | Add to Project into a REDcode project: loose files (0.18.0) and an archive (0.25.0), all resources, chosen ones, and a second time | **Passed.** Loose files went under `source\resources`, archive resources under `source\archive`, a repeat counted them as already there. The owner: this replaces installing a contributor's .archive into the game for WolvenKit to expand, copying out and removing it again. Seen: "project" alone read as EDGEdeck's library at first |
| 10-17 | 0.27.3 | PC | REDmod deploy (M1): the REDmod DLC installed, a REDmod package added and deployed | **Passed.** The first time a REDmod package went through EDGEdeck's deploy and `redMod.exe deploy` |

| 10-26 | Test build from `main` (after 0.28.0) | Not recorded | **Move library** (0.29.0) | **Passed.** |
| 10-26 | Test build from `main` (after 0.28.0) | Not recorded | **Get the frameworks** (0.29.0) | **Passed.** |
| 10-26 | Test build from `main` (after 0.28.0) | Not recorded | **Update all** and the row's update button (0.29.0) | **Passed.** |

## Waiting for a hand test

Every hand test before 0.27.4 has passed (2026-10-17). New ones go in this table:

| # | Test | Since | Steps |
|---|---|---|---|
| 1 | **Add an archive to the REDcode project** | 0.27.4; REDcode 0.6.1+ and an open project | Right-click an `.archive` outside the library in the Explorer (or run the command and pick one): all or chosen resources land under `source\archive`, nothing changes in the library or the game. Again: Keep mine and Replace. The right-click menu on a mod says **Add to REDcode project** |
| 2 | **Run game** | 0.28.0 | With nothing to deploy, the play button in the Mods view starts the game through Steam with `-modded` (REDmod mods load). Turn a mod on, click it again: it deploys first, then starts. With the game open: "already running", no second copy. On the page, **Run game** does the same. `edgedeck.launch` set to exe starts `bin\x64\Cyberpunk2077.exe -modded` |
| 3 | **Rename** | 0.28.0 | Right-click a mod with two versions > Rename...: both versions show the new name, the row stays in its section, the loadouts still know it. F2 on a selected row does the same. Download a newer version from Nexus: it arrives with the new name. Rename to empty: the first names come back |
| 4 | **A project beside a mod of the same name** | 0.28.0; REDcode | Install a project from REDcode when EDGEdeck already has a mod of that name from another folder (the two EDGEmat_M3 folders): one question. **Use this project**: no second mod, the existing one follows the new folder. Again with **Keep both**: the project becomes version `dev 2` of that mod and is on in its place. When another mod wins its files, the deploy message says "The game still has X" with **Let Y win** |
| 5 | **Deploy one mod** | 0.28.0; a REDcode that calls `deployMod` | REDcode's Install deploys only that mod; the message says how many other changes still wait. Also `edgedeck deploy --mod <id>` |
| 6 | **Claude Code asks before deploy, undo and remove** | 0.28.0; Claude Code in auto mode | EDGEchat's P1 test again: "deploy my mods" asks before `edgedeck_deploy` runs. The same for `edgedeck_undo` and `edgedeck_remove` |
| 7 | **Check one mod for an update** | 0.29.0; signed in to Nexus | On the page, the check icon (a circular arrow) shows on mods from Nexus only. On a mod with a newer file: "X 1.2 is on Nexus" with **Update**, which updates it, and the row gets its update icon. On an up-to-date mod: "X is up to date". The daily check of all mods still runs as before |
| 8 | **Adding REDnode itself** | 0.29.1 | Add `REDnode-<version>.zip`: the name offered is **REDnode** (not "Ask mod") and the version is the zip's. No "EPERM, Permission denied" toast after it is added. A zip with one REDnode app (EDGEbuilder) is still named from its manifest |
| 9 | **EDGEbuilder in its own row** | 0.29.2 | With the TestMod dev build and EDGEbuilder both in the library: two rows, EDGEbuilder and TestMod, and TestMod's version list has no EDGEbuilder in it |
| 10 | **The update check counts what the table shows** | 0.29.2; signed in to Nexus | Check updates with older versions kept off in the library: the message names the same mods the table marks (one on 10-31, not 11) and offers **Update all** |
| 11 | **Update shown** | 0.29.2; two or more updates waiting | On the page, pick the **Update available** chip or type a search: the button reads **Update shown** with the count of mods showing that have an update, and the question lists only those. With nothing narrowing the list it reads **Update all** again. A search with no update showing greys it out |
| 12 | **A project that drops files** | 0.29.2; a REDcode project in the library | Remove a file from the project and pack again: after a refresh, that file leaves the project's mod (Pending changes says it is removed), and Deploy takes it out of the game |
