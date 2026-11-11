---
title: Tests
---

# <span class="y">Tests</span>

Every test run on EDGEdeck so far: how to run it again, what to expect, and what it showed. The automated tests run on every release; the hand tests are the owner's, on the laptop and on the owner's PC (game on `E:`). New tests are added here when they are first run.

Releases up to 0.26.6 were published as REDdeck; this page uses the new name throughout.

Last updated 2026-11-02. Dates before 2026-10-17 come from the session records; anything not confirmed there is marked unverified.

## At a glance

| Test | Kind | Last run | Result |
|---|---|---|---|
| [Type check and build](#type-check-and-build) | Automated, every release | 2026-10-31 (0.29.2) | Pass |
| [Smoke test](#smoke-test) | Automated, every release | 2026-10-31 (0.29.2) | Pass |
| [UI test](#ui-test-in-a-real-vs-code) | Automated, by hand only (not in CI) | 2026-10-25 (`main` before 0.29.0) | Pass |
| [Release workflow](#release-workflow) | Automated, Run workflow from the Actions tab | 2026-10-31 (v0.29.2) | Pass |
| [npm package install](#npm-package-install) | By hand | 2026-10-16 (0.26.5) | Pass |
| [Hand tests by the owner](#hand-tests-by-the-owner) | By hand, real game | 2026-11-02 | 45 runs, see the table |
| [Waiting](#waiting-for-a-hand-test) | By hand | | none open |

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
| Families and order | Versions newest first, update, switch version, a new version takes the old one's place, two on in a family found; place above; sections (add, order, move, rename, delete, the section box); Nexus file lines (update chain, name, a retired file's successor, the newest of a line, the split of merged files, a real page's files: mod 3783) and page groups (child names, kept together in the order, the box that remembers, one section, moves and drags inside and past a group) |
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
| 11-01 | 0.29.3 | PC | **A project beside a mod of the same name** (0.28.0; waiting test 4, all 16 steps with a copy of TestMod2) | **Passed.** One question; Use this project kept one row, following the copy; Keep both made `dev 2`. Found: removing one version, the question named only the mod, not the version. Fixed for the next build: it names the version and its project folder, and says the others stay |
| 11-01 | 0.29.3 | Not recorded | **Adding REDnode itself** (waiting test 8) | **Failed.** `Error: ENOENT, not found in ...\red4ext\plugins\REDnode\host\resources\app.asar`, after "could not remove the temporary folder ... (EPERM)". Inside VS Code, Electron's fs reads every `.asar` as a folder; the 0.29.1 fix (retries) had been checked with plain Node, where that does not happen, so it missed the cause. Fixed for the next build: EDGEdeck's file work uses Electron's `original-fs` (`src/fsx.ts`); the UI test now adds a `.asar` inside the real extension host, and fails without the fix |
| 11-01 | 0.29.4 | Not recorded | Waiting tests 1 to 3 and 5 to 7: **Add to REDcode project** for an `.archive` (0.27.4), **Run game**, **Rename**, **Deploy one mod** from REDcode's Install and `deploy --mod`, **Claude Code asks before deploy, undo and remove** (0.28.0), **Check one mod for an update** (0.29.0) | **Passed.** Found on the way, fixed in 0.29.4 or in the steps: the menu item needed an open project folder (the steps said so after), its name is now Add to REDcode project, the library is named where it shows, and the command line needs `--library` |
| 11-01 | 0.29.4 | Not recorded | **Adding REDnode itself** again (test 8, after the `.asar` fix) | **Passed.** Named REDnode, no EPERM note, no `app.asar` error |
| 11-01 | 0.29.4 | Not recorded | Waiting tests 9 to 12: **EDGEbuilder in its own row** (a folder mod carrying its app), **the update check counts what the table shows**, **Update shown**, **a project that drops files** (0.29.2) | **Passed.** |
| 11-01 | 0.29.4 | Not recorded | Waiting tests 13 and 14: **Mod manager download in EDGEkit**, **old link setups update themselves** (0.29.3) | **Passed.** |
| 11-01 | 0.29.4 | Not recorded | Waiting test 15: **Deploy or undeploy one mod from its row** (0.29.4) | **Passed.** |
| 11-01 | EDGEkit 1.140.2 test build with the Nexus links task | PC | EDGEkit's installer checkbox, on a first install after uninstalling EDGEkit | **Passed.** The box started unticked with Vortex holding the links; ticked, the links went to EDGEkit's EDGEdeck; every step as written |
| 11-02 | `main` after 0.29.4 (for 0.30.0) | Not recorded | Waiting test 16: **files an older EDGEdeck merged are split**, page 3783 | **Passed**, with Gorilla Arms - remove knuckles as the merged file: a window still on 0.29.2 had taken that link and added it as version 1.0 of UV Framework. After updating that window's EDGEdeck, Check updates split it into its own row under the page. Led to the step "the test build in every window, not F5" |
| 11-02 | `main` after 0.29.4 (for 0.30.0) | Not recorded | Waiting tests 17 and 18: **each file of a page is a mod of its own**, **the page's row** | **Passed.** Led to a Remove from Library button on the page's row (test 19), and every remove tooltip reads "from Library" |
| 11-02 | `main` after 0.29.4 (for 0.30.0) | Not recorded | Waiting test 19: **remove a whole page** | **Passed** on the second run. The first run removed the files but left the rows about 10 seconds with no sign of work (a full reload after every remove); fixed the same day: the rows leave on confirm and a notification shows during the conflict check |
| 11-08 | `main` after 0.30.0 (for 0.30.1) | PC | **Hide mods that are off**, the Mods view's title bar eye | **Passed.** |

## Waiting for a hand test

Every hand test through 0.29.4 has passed (2026-11-01), tests 16 to 19 for 0.30.0 (2026-11-02), and the eye for 0.30.1 (2026-11-08). New ones go in this table, with the columns # (kept until the list is done), Test, Since and Steps; a passed one moves to the table above.

| # | Test | Since | Steps |
|---|---|---|---|
| 20 | **Same bytes copied over a deployed file** (#13) | 11-10 | In REDcode, Pack and Play a project EDGEdeck installed, while the game runs. Quit the game, then deploy (or REDcode's Uninstall). **Expect:** no "changed in the game folder" question; the pending changes say "copied over in the game folder with the same bytes". Then copy a different file over a deployed one by hand and deploy: the question still comes. |
| 21 | **Run game, exe route** (#12) | 11-10 | Set `edgedeck.launch` to `exe`, press Run game, then F10 in the game. **Expect:** REDnode's launcher and apps, not only a cursor. Set it back afterwards. |
| 22 | **Deploy with REDbridge running** (#10) | 11-10 | See **Test 22, step by step** below. |
| 23 | **Downloads one at a time, speed shown** (#9) | 11-10 | Free account: press Mod manager download on three files quickly. **Expect:** the first shows "12 of 70 MB · 1.4 MB/s · 42 s left"; the others "waiting: 1 download ahead" and "2 downloads ahead" until their turn. Premium account: all start at once. Signing out and in again (free or Premium) changes which. |
| 24 | **Vortex imports: names, ids and each file its own update** (#6, #8) | 11-10 | Import from a Vortex staging folder with newer-style folders (`Name 12345 1.2.0 2026-...Z hash`) and a page with a main and an optional file. **Expect:** clean names, Open on Nexus Mods works, and Check updates splits the page's files into rows of their own; Update all offers no file of another line. |
| 25 | **Free account update pages** (#5) | 11-10 | Free account, a mod with an update: press its update. **Expect:** the file's page opens at the Mod manager download, and the file comes back to EDGEdeck through the nxm link. Note which button the page shows. |
| 26 | **Columns button** | 11-10 | On the EDGEdeck page, press **Columns** and untick Size and Status. **Expect:** both go at once; section and page rows still span the whole table. Close and reopen the page, and reload the window: still hidden. Press Largest first: Size shows while it is on. Drag a column's edge, then tick Status again: the dragged width stays. Tick everything back. |
| 27 | **Newest update first** (#7) | 11-10 | Press Check updates, then **Newest update first**. **Expect:** one list across the sections, newest Nexus upload on top, with an Updated column while it is on; dragging does nothing. Hover a date: the tooltip says whether it is from Nexus, from the Vortex folder's name or the day the mod was added, and names your file's date when Nexus has a newer one. Press it again: sections back, Updated hidden unless ticked under Columns. Largest first and Newest update first turn each other off. |

### Test 22, step by step

What it checks: before a deploy, an undo or a remove, EDGEdeck stops its own REDbridge (the archive scanner) and waits for it to exit, so it cannot hold an archive Windows needs to replace. It starts again only when the conflict scan meets an archive in `archive/pc/mod` it has not read yet; for archives it has read, the scan uses what it saved, and REDbridge stays off until it is needed. `REDbridge stopped` appears only when it was running. On the reporter's PC the scanner held `WeaponCharms.archive` and the deploy stopped with "in use, so Windows would not change it". The hold may not happen on every PC, so the test also checks the stop and the restart in the log.

**Before you start**

- The game is closed, and EDGEdeck (not Vortex) manages the game folder.
- REDbridge is installed: the EDGEdeck page's footer shows a green dot and `REDbridge 0.12...`. If it says "No REDbridge", use **Get REDbridge** there first.
- A mod with an `.archive` file in `archive/pc/mod` (its Kind shows `archive`) that has **two versions** in the library (its Ver cell is a list), deployed. That is the reported case: the old version's archive, hardlinked into the game, gets replaced. Frameworks such as ArchiveXL keep their archive under `red4ext/plugins`, which the scanner does not read, so they do not cover it. If no such mod has two versions, do B and C.
- Open the log: **View > Output**, then pick **EDGEdeck** in the list at the right of the panel.
- Optional: Task Manager, **Details** tab, sorted by name, to watch `REDbridge.exe`.

**A. Switch versions and deploy (the reported case)**

1. Open the EDGEdeck page and wait a few seconds. **Expect** in the log: `REDbridge 0.12... (WolvenKit ...) at ...`, then `Archive scan: <n> archives, ...`. `REDbridge.exe` is in Task Manager.
2. In the mod's Ver list, pick its other version. Press **Deploy**.
3. **Expect:** the deploy finishes with its usual message, and no "in use, so Windows would not change it" error. In the log, in this order: `REDbridge stopped, so it lets go of the archives it read`, then `Deployed (link): ...`, then `Archive scan: ...`. The version you picked has an archive the scanner has not read, so `REDbridge 0.12...` comes just before that scan line, and in Task Manager `REDbridge.exe` goes away during the deploy and comes back after it.
4. Pick the first version again and deploy. **Expect** the same, except that REDbridge may stay off: the scanner has read both versions' archives now.

**B. Turn a mod off and deploy**

1. Untick a deployed mod with an `.archive` file and press **Deploy**.
2. **Expect:** no error; `REDbridge stopped, ...` if REDbridge was running, then `Deployed (link): ...` and `Archive scan: ...`. REDbridge stays off here: the scan has nothing new to read.
3. Tick it again and deploy.

**C. Remove a mod**

1. Add any small mod with an `.archive` file (a spare download is fine) and wait for `Archive scan: ...` in the log, so the scanner has read it.
2. Press its **Remove from Library** button and confirm.
3. **Expect:** no error; its row goes at once; the log shows `REDbridge stopped, so it lets go of the archives it read`, then `Removed ...`, then the scan again. Its folder is gone from the library's `library` folder. (Step 1 is where REDbridge starts again: the new mod's archive is one it has not read, so `REDbridge 0.12...` comes before that scan.)

**Passed** when A, B and C give no "in use" error, the log shows `REDbridge stopped` before each change made while REDbridge was running, and REDbridge starts again whenever the scan has a new archive to read. **If an "in use" error appears:** note the file it names, whether `REDbridge.exe` was in Task Manager at that moment, and copy the EDGEdeck log from the step before.

### Tests 16 to 18, step by step

The page is -KS- UV Texture Framework (https://www.nexusmods.com/cyberpunk2077/mods/3783?tab=files): two main files, **1. UV Framework 4.1** and **2. (OPTIONAL) UV HQ Arms**, and optional files such as **Nanarc's Arm Tattoo Overlays**. Nothing here needs a deploy; don't deploy until the clean-up.

**16. The split** (do this first, while EDGEdeck 0.29.4 from the Marketplace is installed):

1. On the page's Files tab, press **Mod manager download** on **1. UV Framework 4.1**, then on **2. (OPTIONAL) UV HQ Arms**. 0.29.4 shows the bug: HQ Arms arrives as an older version of the framework, switched off, and the framework's version list shows 4.1 and 1.1.
2. Install the test build: in the Extensions view, **...** > **Install from VSIX...** > `dist\edgedeck-win32-x64-0.29.4.vsix` in the EDGEdeck repo (made by `npm run package`). It still says 0.29.4; that is expected. Then reload **every** VS Code window, or close all but one. Not F5: a Mod manager download goes to whichever window VS Code picks, and a window still running the old EDGEdeck takes the link with the old code (on 11-02 a window open since 11-01, on 0.29.2, added Gorilla Arms as a version of the framework while the F5 window showed the new rows). The `EDGEdeck <version> starting` line at the top of each window's EDGEdeck log says which code it runs.
3. Press **Check updates** on the EDGEdeck page.
4. **Expect:** a message that **-KS- UV Texture Framework: (OPTIONAL) UV HQ Arms** is now a mod of its own. The list has a row **-KS- UV Texture Framework** with two files under it: **UV Framework** 4.1 (on) and **(OPTIONAL) UV HQ Arms** 1.1 (off). Neither has a version list, and neither is offered an update.

**17. New downloads** (the test build installed):

1. Remove **(OPTIONAL) UV HQ Arms** (its remove icon), then press **Mod manager download** on it again on Nexus.
2. **Expect:** no "new version of" message. It arrives on, as a file under the page's row. The UV Framework file stays on.
3. In the Optional files section, press **Mod manager download** on **Nanarc's Arm Tattoo Overlays**. **Expect:** a third file under the page's row, 1.0, on.
4. Press **Mod manager download** on **1. UV Framework 4.1** again. **Expect:** "already in the library"; nothing is downloaded and the other files stay on.
5. Press the check icon on the page's row. **Expect:** all three up to date.

**18. The page's row** (the three files from test 17, all on):

1. Untick **(OPTIONAL) UV HQ Arms**. **Expect:** the page's box shows a dash, and its row says `3 files from one Nexus page, 2 on`.
2. Click the page's box. **Expect:** all three off.
3. Click it again. **Expect:** UV Framework and the tattoo overlays come back on; HQ Arms stays off.
4. Click the arrow before the page's name. **Expect:** its files fold away. Close the EDGEdeck page and open it again: still folded. Unfold it.
5. Type `hq arms` in the search box. **Expect:** the page's row and HQ Arms only. Clear the search.
6. On a file, press Move up and Move down. **Expect:** it trades places with the page's other files, and its Move up is greyed out at the top of the group. Drag a file onto a mod outside the group. **Expect:** no drop line; nothing moves.
7. Drag the page's row below another mod. **Expect:** all three files move together. Use the page's section button to put it in a section of yours. **Expect:** all three files go there.
8. In the Mods view (the sidebar): the same page row with its three files under it. Its box does what step 2 and 3 did.
9. Click **(OPTIONAL) UV HQ Arms**. **Expect:** the detail panel says it is one of 3 files from the Nexus page -KS- UV Texture Framework, and names the other two.
10. **Clean up:** remove the three files, and the section if you made one. Reinstall EDGEdeck from the Marketplace if you want to leave the test build.
