## What goes wrong, or what it adds

## The change

## Tested

- [ ] `npm run typecheck`, `npm run build` and `npm run smoke` pass (the Checks workflow runs them too)
- [ ] `npm run test:ui` passes, if the change touches the extension (anything under `src/` that runs inside VS Code)
- [ ] By hand: what you tried, and what you did not

## Checklist ([CONTRIBUTING.md](https://github.com/Edgemodders/EDGEdeck/blob/main/CONTRIBUTING.md))

- [ ] One line under **Unreleased** in `CHANGELOG.md`, in its group, for players and modders
- [ ] Files read and written through `./fsx`, never `node:fs`
- [ ] Plain words in anything a player sees
- [ ] A new MCP tool that writes to the game folder or deletes has `AskFirst`, and `docs/npm.md` lists it
- [ ] No game files, mod archives or anything extracted from the game
