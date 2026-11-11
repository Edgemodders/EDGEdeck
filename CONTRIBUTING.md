# Contributing to EDGEdeck

Thanks for helping. Issues and pull requests are both welcome. This page says what a pull request needs to be merged quickly.

## Before you start

- For anything larger than a fix, open an issue first, so we can agree on the shape before you write it.
- Read the design page, https://edgemodders.github.io/EDGEdeck/design.html. It has the word list, the library layout and the deployment rules.
- One change per pull request. Small ones get merged faster.

## Build and test

You need Windows and Node.js 22 or newer.

```
npm ci
npm run typecheck
npm run build
npm run smoke
```

`npm run smoke` works against a fake game folder in a temp folder. It does not touch your game or your library. Some parts run only when this PC has them, such as REDbridge or a Vortex staging folder, and are skipped otherwise.

If your change runs inside VS Code (the extension, the page, a panel), also run `npm run test:ui`, which starts a real VS Code.

Every pull request runs the **Checks** workflow: typecheck, build and smoke on GitHub's Windows runner. It also keeps a `.vsix` of your branch as the run's artifact, so anyone can install it and try the change. A first-time contributor's run waits for a maintainer to approve it.

## The rules a review checks

| Rule | Why |
|---|---|
| Add one line under **Unreleased** in `CHANGELOG.md`, in its group (**New**, **Changed**, **Fixed**, **Other**), written for players and modders. Full URLs only. | Release notes for GitHub, the stores and Nexus come from this file. |
| Import `fs` from `./fsx`, never from `node:fs`. | Inside VS Code, Electron's `fs` treats every `.asar` file as a folder; `fsx` uses the real one. |
| Plain words in anything a player sees: On/Off, Deploy and Undo deploy, Library, Kind, Conflicts. Never "activate", "purge", "staging", "mod type" or "profile". | One list, four verbs; the design page has the full word list. |
| Decide, don't ask. A question only when a wrong guess would lose data. | Simplicity is the design goal. |
| Never delete a file EDGEdeck did not put there. Everything deployed is in the manifest and can be undone. | Safe by default. |
| A new MCP tool that writes to the game folder or deletes gets `AskFirst` in `src/mcp.ts`, and `docs/npm.md` lists every tool. | The assistant asks before each such call. |
| Never import REDcode's or REDbridge's code; find them at runtime. | EDGEdeck works offline and alone. |
| No game files, mod archives or anything extracted from the game, in the code or the tests. | Licences. |

## Writing style

Plain, short sentences. Tables for comparisons. Mark anything you have not checked as unverified.

## Licence

EDGEdeck is MIT-licensed. By sending a pull request you agree that your change is published under the same licence.
