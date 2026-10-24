# EDGE<span class="y">deck</span> docs

EDGEdeck is a mod manager for Cyberpunk 2077 that runs inside VS Code and REDcode. One list of mods, four verbs: add, turn on or off, deploy, remove. These pages cover how to use it, how it is designed, and how to build it.

| Document | What it covers |
|---|---|
| [Guide](guide.html) | Install, set up, the Mods view and the EDGEdeck page, adding mods, deploying, conflicts, frameworks and game patches, updates, disk space, loadouts, settings, the command line, troubleshooting |
| [Design](design.html) | The goal and its rules, how Cyberpunk mods are installed, what Vortex solves, the UI, the library and deployment, conflicts, Nexus, risks and roadmap |
| [Changelog](changelog.html) | What changed in each release, newest first, and what waits for the next one under Unreleased |
| [Tests](testing.html) | Every test so far: the automated ones and what they check, the publish runs, and each hand test by the owner with its result and what it led to; tests still waiting |
| [Dev setup](dev-setup.html) | Every tool and step needed to build EDGEdeck on a new machine |

## Roadmap status

As of 0.28.0 (2026-10-22). EDGEdeck manages the owner's two PCs. It is on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=edgemodders.edgedeck) and [Open VSX](https://open-vsx.org/extension/edgemodders/edgedeck) (preview), and each release's `.vsix` is on the [releases page](https://github.com/Edgemodders/EDGEdeck/releases).

| Phase | Status |
|---|---|
| M0 Decide | Done. Name, repository, the word list and the four verbs |
| M1 Library | Done. Add from zip, 7z, rar or folder with the classifier; hardlink or copy deploy with a manifest, undo and backups; changes made outside EDGEdeck; conflicts by order and `modlist.txt`; import from Vortex; a pending-changes list that explains every file the next deploy touches; sizes everywhere for disk-space questions |
| M2 Kinds | Done. Frameworks group with the game version, a warning when the game changed since the last deploy and a Nexus check for the frameworks; detail panel; file conflicts with Let X win; archive conflicts through REDbridge, which Get REDbridge fetches and keeps current; REDmod deploy |
| M3 Nexus | Done, in daily use with a pasted key. Sign in in the browser with OAuth and PKCE, built and tested against a fake Nexus, live once Nexus assigns EDGEdeck a client id (asked 2026-10-13; Nexus answered on 2026-10-22 with requests to meet first); a pasted key stays a choice. Update check once a day, one row per mod with a version dropdown, update from the row, nxm link handling, downloads for Premium and for links with a key |
| M4 Loop | EDGEdeck side done: a `.cpmodproj`'s packed output as a mod that is re-synced after every pack and relinked on deploy; an API for other extensions that REDcode's Install calls (install a project, deploy one mod); REDnode packages as a kind (0.20.0), installed into REDnode's apps folder; Run game with `-modded` (0.28.0). The REDcode side lives in [REDcode](https://github.com/Edgemodders/REDcode) |
| M5 Share | Done. Loadouts, the `edgedeck` command line, and an MCP server with the same verbs as tools, registered with VS Code for the agents it hosts and one line away for Claude Code. A Set up group walks a new install through the game folder, REDbridge, Nexus and Vortex. On the VS Code Marketplace and Open VSX since 0.26.0; the command line and MCP server on npm as `@edgemodders/edgedeck-mcp` since 0.26.4 |
| M6 Setup | Under way, agreed 2026-10-22 (the design's [Next](design.html#next) section). Built on `main` for the next release: Move library (anywhere, with a Set up step when the library and the game are on different drives) and Get the frameworks (the six from their authors' GitHub releases, one click). Left: a Nexus mod's requirements, after Nexus's requests |

Source code, releases and issues: [github.com/Edgemodders/EDGEdeck](https://github.com/Edgemodders/EDGEdeck)
