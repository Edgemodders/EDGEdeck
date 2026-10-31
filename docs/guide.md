---
title: Guide
---

# EDGE<span class="y">deck</span> guide

How to use EDGEdeck, from install to a modded game. EDGEdeck is a mod manager for Cyberpunk 2077 that runs inside VS Code. It keeps your mods in a library outside the game folder, deploys the ones you turn on, and undoes that just as cleanly. One list of mods, four verbs: add, turn on or off, deploy, remove.

## 1. Install

EDGEdeck runs on Windows, in [VS Code](https://code.visualstudio.com/) 1.80 or later or in [VSCodium](https://vscodium.com/). It is a VS Code extension, not a game mod: never install it with Vortex.

**From a store (recommended).** In VS Code, open the Extensions view (`Ctrl+Shift+X`), search for **EDGEdeck** and click Install. It is on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=edgemodders.edgedeck) and [Open VSX](https://open-vsx.org/extension/edgemodders/edgedeck) (VSCodium's store) as a preview, and updates itself from there.

**From a file.** Each release's `edgedeck-<version>.vsix` is on the [releases page](https://github.com/Edgemodders/EDGEdeck/releases). Install it from a terminal:

```powershell
code --install-extension edgedeck-0.28.0.vsix
```

or in VS Code: open the Extensions view, press the `...` menu at its top right, pick **Install from VSIX...** and choose the file. Then run **Developer: Reload Window** from the command palette (`Ctrl+Shift+P`). To update later, install the newer file the same way; your library and settings stay.

An EDGEdeck icon appears in the activity bar on the left. Click it for the Mods view.

EDGEdeck was called REDdeck up to 0.26.6. Nothing carries over from REDdeck: turn every mod off and deploy in REDdeck, uninstall it, then set up EDGEdeck as new.

## 2. Set up

The first time, the Mods view shows a **Set up** group with a row for each thing EDGEdeck needs or can use. Each row is a button. Rows disappear as you do them, and the `x` on a row hides one you do not want. **EDGEdeck: Set up...** in the command palette lists every step, done or not, and brings hidden rows back.

| Step | What it does | Needed? |
|---|---|---|
| **Find the game folder** | EDGEdeck looks for Cyberpunk 2077 in every Steam library, then GOG and Epic, on every start. This row appears only when that fails: pick the folder that contains `bin`, `archive` and `r6`. | Yes |
| **Move the library to the game's drive** | Shown when the library and the game are on different drives, so deploy copies every file. Runs **Move library...** (see [Deploying](#6-deploying)). New in 0.29.0. | No, but saves disk space |
| **Get the frameworks** | Shown while RED4ext, Cyber Engine Tweaks, redscript, ArchiveXL, TweakXL or Codeware is missing from the library. Gets them in one go (see [The Frameworks group](#the-frameworks-group)). New in 0.29.0. | Most mods need them |
| **Get REDbridge** | Downloads [REDbridge](https://github.com/Edgemodders/REDbridge), about 70 MB, into EDGEdeck's own folder, plus the .NET 10 runtime for your user account if there is none. With it, EDGEdeck sees conflicts between files *inside* mod archives. EDGEdeck checks once a day for a newer REDbridge and offers it; **Update REDbridge** in the command palette checks now. The old version is removed after an update. REDnode finds this copy and uses it too. | No, but recommended |
| **Sign in to Nexus Mods** | For update checks and downloads from the site. Sign in opens the Nexus sign-in page in your browser; approve EDGEdeck there and the tab says "Signed in". EDGEdeck keeps the sign-in in VS Code's secret storage and renews it by itself. Until Nexus has registered EDGEdeck, sign in opens your [API Access page](https://www.nexusmods.com/users/myaccount?tab=api+access) instead, where you create a personal key and paste it in. The key works the same way, and **Nexus: set API key (paste, instead of signing in)** is always there if you prefer it. **Nexus: sign out** removes either. | No |
| **Handle Nexus download links** | Makes the **Mod manager download** button on Nexus pages send the file to EDGEdeck. Vortex takes the links back whenever it starts, so this row returns if you use both. | No |
| **Import from Vortex** | Copies the mods Vortex has for Cyberpunk into the library. Vortex is left alone. Shown when Vortex has mods and the library has none from it. | No |

The status bar at the bottom of VS Code shows EDGEdeck's state in one line: how many mods are on, whether a deploy is waiting, or that the game was not found. Click it to deploy, or to pick the game folder.

## 3. The Mods view

The sidebar view is one list in three groups: **Set up** while anything is missing, **Frameworks**, and **Mods**.

- **The checkbox** turns a mod on or off. Nothing touches the game until you deploy.
- **The line after the name** shows the version, how many other versions are in the library, the size, and the status: `deployed`, `not deployed yet`, `off`, `off, still deployed`, `changed in game folder`, `update 1.2 available`, `loses 3 archive files`.
- **Click a mod** for its detail panel: the files it deploys, its conflicts by file path and inside archives, and buttons for turn on, move, open folder, Rename, Open on Nexus, Update and Remove.
- **Expand a mod** for the folders it deploys into and the files in them. Click a file to open the library copy. Hover anything for a card with size, dates, where it deploys and where it came from.
- **Hover a row** for its buttons: Move up, Move down and Switch version. The mod higher in the list wins a conflict. Right-click for the rest: Details, Open on Nexus Mods, Reveal in File Explorer, Reveal in Game Folder, Rename, Remove, and, when a REDcode project is open, Add to REDcode project.
- **Rename** (right-click, or F2 on the selected row) gives a mod a name of your own in EDGEdeck. Every version of it gets the name, and new versions take it when they arrive. Its files and the game do not change. Rename to an empty name to go back to the first one.

### Add to REDcode project

With a REDcode project open in the workspace (a folder with a `.cpmodproj` file), right-click a mod, a folder or a file and pick **Add to REDcode project**. Loose files, such as scripts, CET Lua, TweakXL YAML, ArchiveXL files and configs, are copied into the project's `source/resources` under their deploy paths, so the packed mod carries them at the same place in the game. A file the project already has with other content is left alone unless you say Replace. For an `.archive` file, EDGEdeck lists what is inside and asks for all of it or a pick; REDcode then extracts those meshes, textures and entities into `source/archive` at their game paths (this needs REDcode 0.6.1 and REDbridge 0.7.1 or newer). Resources the project already has are kept unless you say Replace.

An `.archive` that is not in your library, such as one a contributor sent you, goes in the same way without installing it anywhere: right-click it in VS Code's Explorer and pick **Add an archive to the REDcode project...**, or run that command and pick the file.

Another author's assets are theirs; check the mod's permissions on Nexus before you ship them.

The view's title bar has **Open EDGEdeck**, **Add mod**, **Deploy**, **Run game**, **Nexus: check for updates**, **Switch loadout** and **Refresh**. Its `...` menu holds the rest: Show conflicts, Show pending changes, Nexus sign in, Import from Vortex, Undo deploy (after a deploy), Nexus: add from a link, Add from REDcode project, Get REDbridge, Open library folder, Pick the game folder, Show log, the loadout commands (Switch loadout, Save as new loadout, Export the active loadout, Import a loadout), Get the frameworks, Update all and Move library. Every command is also in the command palette (`Ctrl+Shift+P`) under **EDGEdeck:**.

### The Frameworks group

RED4ext, Cyber Engine Tweaks, redscript, ArchiveXL, TweakXL, Codeware, Audioware, input_loader and mod_settings are mods like any other, pinned at the top because most other mods depend on them. The group's header carries the game version: `3, 3 on · game 2.31`.

**Get the frameworks** (new in 0.29.0: the download button on the group's header, the Set up step while any is missing, the link on the page, or the `...` menu) gets RED4ext, Cyber Engine Tweaks, redscript, ArchiveXL, TweakXL and Codeware in one go. One list shows each with what the library has and what is out; the missing and older ones are ticked. EDGEdeck downloads them from each author's GitHub release, the same files and versions as on Nexus, so it needs no Nexus account. Each one joins the same mod as a Nexus download of that framework would, so its versions, the update check and Switch version work as for any mod. Then deploy.

A game patch is the usual reason a modded game stops starting. EDGEdeck records the game version at every deploy, and when the executable's version differs from it, the header says `game updated to 2.31` with a warning icon. If you are signed in to Nexus, EDGEdeck checks the frameworks once for that version and names the ones with newer files; otherwise it asks you to sign in. Update each framework from its `update ... available` link, or all at once with **Update the frameworks** on the page; then deploy.

**Update all** (new in 0.29.0) updates every mod with an update waiting, frameworks or not, after one question. It is a button on the EDGEdeck page (greyed out while nothing waits) and a hover button on the Frameworks header in the Mods view while any mod has one. Each mod's row on the page also has an update button in its Actions column, and a check button that asks Nexus about that mod alone. Frameworks come from their GitHub releases; other mods from Nexus, where free members press Mod manager download on each file page EDGEdeck opens. The older versions stay in the library, off; deploy to put the new ones in the game. With a search typed or a filter chip picked (**Update available** narrows the list to the mods with updates), the button reads **Update shown** and updates only the mods showing.

## 4. The EDGEdeck page

**Open EDGEdeck** (the first title-bar button, or the command) opens the wide table in the editor area. Use it for bigger jobs; the sidebar is its compact companion.

- **Columns:** on/off, name, version, kinds, size, status, and Actions: icon buttons for Details, Move up, Move down, Section, Open folder, Check for an update and Update (for a mod from Nexus; Update only while one waits), Open on Nexus and Remove. Drag the edge of a column heading to resize it; double-click the edge for automatic widths.
- **Sections.** Mods are grouped into Frameworks, sections of your own, and Mods. **+ Section** makes one. Put a mod in it with the mod's Section button, or drag the row onto the section's header. A section's header can rename, move or delete it; deleting sends its mods back to Mods and removes nothing. Click a section's name to fold it down to its header. The box on a header turns every mod in that section on or off. Two buttons on every header act on the mods the section shows, after the search and filter: put them all in another section, or remove them all from the library. Filter to **Off** and remove, to clear out mods you no longer use. A section of your own also has rename, move up, move down and X to delete the section. Sections only group the list: the order still decides who wins a conflict.
- **Order.** Move up and Move down move a mod past its neighbour in its section. Or drag a row onto another to put it directly above or below that one.
- **Search** matches name, version, kind and status. **Facet chips** narrow to On, Off, Deployed, Not deployed, Needs deploy, Changed in game folder, Conflicts and Update available, each with its count. A search or a filter opens folded sections while it lasts. **Largest first** sorts by size across every section. The page remembers your filters.
- **The version cell** is a dropdown when the library holds more than one version of a mod, or when Nexus has a newer one: pick a version to make it the active one, or **Get x.y from Nexus**.
- **Status** is a link when a deploy is waiting for that mod: it opens the list of files the next deploy adds, replaces, puts back or removes for it, and why.
- **The toolbar** has Add mod, Check updates or Nexus sign in, Conflicts with a count, Undo deploy, the number of changes waiting, Deploy, and Run game.
- **The footer** shows the library folder and whether deploy uses hardlinks or copies, the last deploy, disk use, and which REDbridge is running.

## 5. Adding mods

**From a file or folder.** Add mod takes a zip, 7z, rar, a single mod file (an `.archive`, `.reds`, `.lua` and so on) or a folder. EDGEdeck opens zip and 7z on its own; a rar needs [7-Zip](https://7-zip.org) or WinRAR installed (or re-pack it as a zip). EDGEdeck works out what kind of mod it is (archive, redscript, CET, RED4ext plugin, TweakXL, REDmod package, REDnode package, a framework) and where its files go, and asks only when it cannot tell, for example when a zip holds several options.

**From Nexus Mods.** With EDGEdeck handling download links, press **Mod manager download** on any file on the site and it lands in the library. Without that, copy the `nxm://` link and use **Nexus: add from a link**. Premium members can also download straight from an `update` link; free members go through the site, which hands EDGEdeck a link with a key.

**From Vortex.** Import from Vortex copies Vortex's mods for Cyberpunk into the library with their names, versions and Nexus ids. Vortex keeps its own copies.

**From a REDcode project.** Add from REDcode project takes a `.cpmodproj`'s packed output as a mod that follows the project: pack again and the library copy refreshes; deploy picks it up.

**REDnode packages.** A mod with a `rednode-app.json` (an overlay app, HUD widget or Node mod for [REDnode](https://edgemodders.github.io/REDnode/)) deploys into `red4ext\plugins\REDnode\apps\<id>`. REDnode itself is a framework. In the game, a new package shows only in REDnode's **Mod Manager** (in the launcher, F10) until you pin it, and any permission it asks for is allowed there.

**Versions.** A mod has one row however many versions are in the library. The newest, or the one that is on, stands for it; the others wait in the version dropdown and in **Switch version...**. Downloading a version already in the library does nothing twice.

## 6. Deploying

Deploy puts the **active loadout** in the game (see [Loadouts](#10-loadouts)). Close the game first: Windows will not let EDGEdeck replace files the running game holds open, so a deploy with the game running waits until you say **The game is closed now**.

After each deploy, the message says how many files went in for how many mods and how many mods are in the game. **View** opens a report of exactly what changed and where; the last 30 reports stay in the library's `deploys` folder.

Turning mods on and off changes nothing on disk. The **Deploy** button counts the files waiting, and **Show pending changes** lists every one with the reason: added, replaced by a mod higher in the list, put back from a backup, relinked after a rebuild, removed.

Deploy hardlinks the files of every mod that is on into the game folder, so they take no extra space, and writes `modlist.txt` for the archive load order. If the library sits on another drive, deploy copies instead. From the next release (not in 0.28.0), Set up then offers **Move library...** (also in the Mods view's `...` menu and the page's footer). It moves the library to a folder you pick, and the next deploy turns the copies into hardlinks. It prepares REDmod packages with `redMod.exe` when any are on. Everything it did goes into a manifest in the game folder.

**Files that changed outside EDGEdeck.** When Steam verify, the game or another tool changed a file EDGEdeck deployed, the mod shows `changed in game folder` and the next deploy asks one question per file: keep the changed file, which imports it into the library, or put the mod's file back. A foreign file in the way of a deploy is moved to the library's backup folder first and comes back on undo.

**Undo deploy** removes every file in the manifest and nothing else, and puts the backups back.

**Vortex.** While Vortex manages the game folder, EDGEdeck refuses to deploy. Purge in Vortex (Mods, Purge) first; after that, both can coexist as long as only one of them has deployed.

## 7. Conflicts

Two mods that deploy the same path, or that carry the same resource inside their `.archive` files, conflict. The mod higher in the list wins, and the game sees its version. The deploy toast says how many conflicts there are, and **Show conflicts** opens a page with every one: the path or the resource, the winner, and the losers.

- **Let X win** on a row moves that mod above the current winner. **Turn off** silences the loser.
- The upper table lists conflicts by file path, which EDGEdeck sees on its own. The lower one lists conflicts inside archives, which needs REDbridge; its heading names the REDbridge in use.
- **Deploy now** on the page applies what you decided.

The detail panel of a mod shows the same for that mod only, and a row's status says `loses 3 archive files` or `overrides 2 archive files`.

## 8. Updates from Nexus

Signed in, EDGEdeck asks Nexus once a day whether any mod with a Nexus id has a newer file, and the row shows `update 1.2 available`. Click it, confirm, and the new version downloads, takes the old one's place and goes on if the old one was on. The old version stays in the library until you remove it. **Nexus: check for updates** runs the check now. The setting `edgedeck.nexusCheckUpdatesOnStart` turns the daily check off.

## 9. Disk space

Sizes show next to every mod, folder and file in the Mods view, in the page's Size column, and in the page footer: `Disk: 160 MB in mods, 1.9 MB in kept downloads`.

- **Mods** is what the library holds. Deployed hardlinks cost nothing extra on the same drive.
- **Kept downloads** are the original zips, kept so a mod can be added again. Safe to delete; the footer link opens the folder.
- **Deploy backups** are foreign files moved aside by a deploy. Undo deploy puts them back.

`Largest first` on the page finds the big ones.

## 10. Loadouts

A loadout is a named set of which mods are on, and which version of each. (Other mod managers call these profiles.) One loadout is always **active**: it is what the Mods view shows, what you change when you turn mods on or off, and what Deploy puts in the game. Your first one is called Default. The library, the sections and the load order are shared by every loadout.

- **Switch loadout** (the button in the Mods view's title bar, or **Make active** on the EDGEdeck page) puts another loadout's choices in place. Deploy afterwards to change the game. Nothing is lost: every change saves into the loadout it was made in.
- **On the EDGEdeck page**, the Loadout dropdown shows any loadout. Pick one that is not active and the page edits it: a banner says so, and its checkboxes, section boxes and version choices change that loadout only. The game and the Mods view keep the active one. The Status column still describes the game.
- **+** makes a new loadout, a copy of the one shown or with every mod off. The other buttons rename, export to a file, import a file as a new loadout, and delete (not the active one).
- A mod added to the library arrives off in every loadout but the active one.
- Loadouts are plain JSON in the library's `loadouts` folder, fine to share. Files saved by EDGEdeck before 0.26 load as loadouts; their order is no longer applied.

## 11. Settings

Open Settings (`Ctrl+,`) and search for `edgedeck`.

| Setting | Default | What it does |
|---|---|---|
| `edgedeck.gamePath` | empty | The Cyberpunk 2077 folder. Empty means find it through Steam, GOG or Epic on every start. Set it only for a game those cannot see. |
| `edgedeck.libraryPath` | empty | Where mods are kept, anywhere you like. Empty means `%USERPROFILE%\EDGEdeck`. Put it on the game's drive so deploy can use hardlinks; **Move library...** moves it and sets this. |
| `edgedeck.bridgePath` | empty | A REDbridge you built yourself. Empty means the copy Get REDbridge fetched, which the page footer names. |
| `edgedeck.dotnetRoot` | empty | A .NET root for the REDbridge process only. Empty means the per-user .NET 10 runtime. Never set `DOTNET_ROOT` for your whole account; it breaks Vortex. |
| `edgedeck.launch` | `auto` | How **Run game** starts the game: `auto` (through Steam for a game in a Steam library, else the exe), `steam`, or `exe` (`bin\x64\Cyberpunk2077.exe`). Every way adds `-modded`, which REDmod mods need. |
| `edgedeck.nexusCheckUpdatesOnStart` | on | The daily Nexus update check. |
| `edgedeck.nexusClientId` | empty | The OAuth client id Nexus assigns to EDGEdeck. With it, sign in happens in the browser and renews itself. |
| `edgedeck.vortexStagingPath` | empty | Where Vortex keeps its mods, for Import from Vortex. Empty means EDGEdeck searches the usual places and asks when it finds none. |
| `edgedeck.nexusApplication` | empty | The application slug for Nexus's older single sign-on, used when there is no client id. |

## 12. The library folder

Everything EDGEdeck knows is in plain files under the library folder, `%USERPROFILE%\EDGEdeck` by default. **Open library folder** in the view's menu opens it.

| Folder or file | Contents |
|---|---|
| `library/<mod>/` | One folder per mod version, laid out exactly as it deploys, with a `mod.json` beside the files: name, version, kinds, source, Nexus data |
| `library.json` | The order of the mods (first wins) and the game folder |
| `downloads/` | The kept original archives. Safe to delete |
| `backup/` | Foreign files a deploy moved aside |
| `deploys/` | The last 30 deploy reports, in Markdown |
| `loadouts/` | Saved loadouts |

The game folder gets a manifest of what EDGEdeck deployed, `edgedeck.deployment.json`, which Undo deploy reads.

## 13. Command line and assistants

The same core runs from a terminal, for scripts and assistants. It is on npm as `@edgemodders/edgedeck-mcp` (Node.js 20 or later): run a command with `npx -p @edgemodders/edgedeck-mcp edgedeck list`, or install it once with `npm i -g @edgemodders/edgedeck-mcp` and type `edgedeck list`. From a clone of this repository, `node bin/edgedeck.mjs` does the same after `npm run build`. Every command prints JSON with `--json`.

```
edgedeck list [--size]           what is in the library, its size and status
edgedeck mod <id>                one mod in full: files, sizes, source, Nexus data, conflicts
edgedeck add <file|folder> [--name N] [--option FOLDER]
edgedeck install-project <.cpmodproj> [--follow | --keep-both]
                                 add a REDcode or WolvenKit project's packed output, or refresh it
edgedeck on <id> | off <id>      turn a mod on or off
edgedeck up <id> | down <id>     change the order (first wins conflicts)
edgedeck rename <id> [name...]   a name of your own; no name puts the first one back
edgedeck remove <id>
edgedeck deploy [--keep PATH...] [--restore PATH...] [--mod ID]
edgedeck undo
edgedeck changes                 files changed in the game folder since the deploy
edgedeck pending                 what the next deploy does, and why
edgedeck conflicts               conflicts by file path (archive conflicts need the extension)
edgedeck loadout save <name> | load <name or file> | list
edgedeck vortex list | import
edgedeck mcp                     serve the same verbs as MCP tools over stdio
```

`--library <folder>` and `--game <folder>` override the folders. Without `--game`, the command line uses the game folder the library remembers, else finds it through Steam, GOG or Epic like the extension. It uses the same library as the extension, and the Mods view follows what it changes.

**MCP without VS Code:** `npx -y @edgemodders/edgedeck-mcp` starts the server; for Claude Code, `claude mcp add edgedeck -- npx -y @edgemodders/edgedeck-mcp`. Its tools are listed on the [npm page](https://www.npmjs.com/package/@edgemodders/edgedeck-mcp).

**An assistant can do all of this for you.** EDGEdeck is an MCP server too, with the same verbs as tools: list and inspect mods, add, turn on or off, reorder, remove, show what a deploy would do, deploy, undo, conflicts, loadouts and Vortex import. Ask "which of my mods are off?" or "deploy my mods and tell me what changed".

- **Agents inside VS Code** (1.101 and later) see EDGEdeck's tools as soon as the extension is installed. Nothing to set up.
- **Claude Code**: run **EDGEdeck: Connect an assistant (MCP)...** from the command palette, pick "Copy the Claude Code command" and paste it in a terminal once. It is a `claude mcp add` line pointing at EDGEdeck's server with your library and game folders.
- **Other MCP clients**: the same command copies a JSON entry, or point the client at `node <extension folder>/dist/mcp.js --library <folder> --game <folder>`.

The tools that write to the game folder or delete, deploy, undo and remove, are marked so the assistant asks you before every call; Claude Code asks even in auto mode. Changes an assistant makes show up in the Mods view by themselves.

## 14. When something is wrong

**"Game not found" in the status bar.** The Set up group has a Find the game folder row; click it and pick the folder with `bin`, `archive` and `r6`. **Show log** prints which Steam libraries EDGEdeck checked; if the game is in one of them, please [report it](https://github.com/Edgemodders/EDGEdeck/issues) with those lines.

**"Vortex manages the game".** Purge in Vortex, then deploy with EDGEdeck.

**No conflicts inside archives.** The page footer says which REDbridge is running, with a green dot, or offers Get REDbridge. REDbridge needs the .NET 10 runtime, which Get REDbridge installs for your user account.

**A mod's file is missing or changed after a Steam verify.** The row says `changed in game folder` or `changed, deploy again`. Deploy puts the mod's files back, asking first about any file that changed.

**"Premium only" when updating.** Nexus serves direct downloads to Premium members only. EDGEdeck opens the file's page instead; press Mod manager download there and the file arrives through the link.

**The log.** Show log in the view's menu, or View, Output, then EDGEdeck in the dropdown. The first lines say where the library and game are and how the game was found.

Source, issues and releases: [github.com/Edgemodders/EDGEdeck](https://github.com/Edgemodders/EDGEdeck). The [design](design.html) explains why EDGEdeck works the way it does.
