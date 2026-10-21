// Runs inside a real VS Code extension host (see scripts/ui-test.mjs): activates EDGEdeck against a
// scratch library and a fake game folder, checks the contributions registered, and drives the
// commands that need no dialog. Throws on the first failure; the runner reports it.

import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { nxmFromQuery } from "./nxm";

export async function run(): Promise<void> {
  // An nxm link through VS Code's own Uri, as the forwarder sends it: every parameter comes back.
  const link = "nxm://cyberpunk2077/mods/35393/files/166705?key=a-b_c&expires=1760000000&user_id=42";
  const uri = vscode.Uri.parse(`vscode://edgemodders.edgedeck/nxm?url=${encodeURIComponent(link)}`);
  assert.equal(nxmFromQuery(uri.query), link, `query as VS Code gives it: ${uri.query}`);
  const lib = process.env.EDGEDECK_TEST_LIB!;
  const game = process.env.EDGEDECK_TEST_GAME!;
  assert.ok(lib && game, "EDGEDECK_TEST_LIB and EDGEDECK_TEST_GAME must be set");

  const cfg = vscode.workspace.getConfiguration("edgedeck");
  await cfg.update("libraryPath", lib, vscode.ConfigurationTarget.Global);
  await cfg.update("gamePath", game, vscode.ConfigurationTarget.Global);

  const ext = vscode.extensions.getExtension("edgemodders.edgedeck");
  assert.ok(ext, "extension edgemodders.edgedeck not found");
  await ext.activate();
  assert.ok(ext.isActive, "extension did not activate");

  const commands = await vscode.commands.getCommands(true);
  for (const c of ["edgedeck.addMod", "edgedeck.importVortex", "edgedeck.addProject", "edgedeck.saveLoadout", "edgedeck.loadLoadout", "edgedeck.exportLoadout", "edgedeck.importLoadout", "edgedeck.nexusSignIn", "edgedeck.nexusSignOut", "edgedeck.nexusSetKey", "edgedeck.deploy", "edgedeck.runGame", "edgedeck.undo", "edgedeck.rename", "edgedeck.remove", "edgedeck.details", "edgedeck.checkConflicts", "edgedeck.openPage", "edgedeck.suggestTheme", "edgedeck.showChanges", "edgedeck.getBridge", "edgedeck.pickGame", "edgedeck.setup", "edgedeck.hideSetupStep", "edgedeck.mcpSetup", "edgedeck.updateBridge", "edgedeck.addToProject", "edgedeck.addArchiveToProject", "edgedeck.switchVersion", "edgedeck.moveUp", "edgedeck.moveDown", "edgedeck.openInExplorer", "edgedeck.openLibrary", "edgedeck.refresh", "edgedeck.showLog"]) {
    assert.ok(commands.includes(c), `command ${c} not registered`);
  }

  // The library is created on activation.
  await vscode.commands.executeCommand("edgedeck.refresh");
  assert.ok(fs.existsSync(path.join(lib, "library")), "library folder not created");

  // A mod placed in the library by hand shows up after a refresh and deploys without a dialog.
  const modDir = path.join(lib, "library", "ui-test-mod");
  fs.mkdirSync(path.join(modDir, "archive", "pc", "mod"), { recursive: true });
  fs.writeFileSync(path.join(modDir, "archive", "pc", "mod", "UiTest.archive"), "x");
  fs.writeFileSync(
    path.join(modDir, "mod.json"),
    JSON.stringify({ id: "ui-test-mod", name: "UI Test Mod", version: "1.0", kinds: ["archive"], enabled: true, added: new Date().toISOString(), source: { type: "folder" }, files: ["archive/pc/mod/UiTest.archive"] }),
  );
  await vscode.commands.executeCommand("edgedeck.refresh");
  await vscode.commands.executeCommand("edgedeck.deploy");
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(fs.existsSync(path.join(game, "archive", "pc", "mod", "UiTest.archive")), "deploy did not link the archive");
  assert.ok(fs.existsSync(path.join(game, "edgedeck.deployment.json")), "no manifest after deploy");
  assert.equal(fs.readFileSync(path.join(game, "archive", "pc", "mod", "modlist.txt"), "utf8").trim(), "UiTest.archive");

  // Show conflicts opens the conflicts panel; the archive scan runs through a bridge or reports that it needs one.
  await vscode.commands.executeCommand("edgedeck.checkConflicts");
  await new Promise((r) => setTimeout(r, 1500));
  const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label));
  assert.ok(tabs.includes("Conflicts"), `no Conflicts tab among ${tabs.join(", ")}`);

  // The pending changes panel opens as a tab.
  await vscode.commands.executeCommand("edgedeck.showChanges");
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label)).includes("Pending changes"), "no Pending changes tab");

  // The mods page opens as a EDGEdeck tab.
  await vscode.commands.executeCommand("edgedeck.openPage");
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label)).includes("EDGEdeck"), "no EDGEdeck tab");

  // Details for the mod opens a webview panel without throwing.
  await vscode.commands.executeCommand("edgedeck.details", { type: "mod", mod: JSON.parse(fs.readFileSync(path.join(modDir, "mod.json"), "utf8")) });
  await new Promise((r) => setTimeout(r, 500));

  // The API REDcode uses: installProject is async (it may ask about a mod of the same name) and
  // deploy() reports the mods that lost files.
  const api = ext.exports as {
    installProject(f: string): Promise<{ id: string; added: boolean } | undefined>;
    deploy(): Promise<{ lost: unknown[] } | undefined>;
    deployMod(id: string): Promise<{ waiting?: number } | undefined>;
  };
  const proj = path.join(lib, "..", "ui-project");
  fs.mkdirSync(path.join(proj, "packed", "archive", "pc", "mod"), { recursive: true });
  fs.writeFileSync(path.join(proj, "UiProject.cpmodproj"), "<CP77Mod><ModName>UI Project</ModName></CP77Mod>");
  fs.writeFileSync(path.join(proj, "packed", "archive", "pc", "mod", "UiProject.archive"), "p");
  const installed = await api.installProject(path.join(proj, "UiProject.cpmodproj"));
  assert.equal(installed?.added, true, "installProject did not add the project");
  const deployed = await api.deploy();
  assert.ok(Array.isArray(deployed?.lost), "deploy() has no lost list");
  assert.ok(fs.existsSync(path.join(game, "archive", "pc", "mod", "UiProject.archive")), "the project did not deploy");
  // deployMod: a rebuilt project goes in alone; nothing else was waiting.
  fs.writeFileSync(path.join(proj, "packed", "archive", "pc", "mod", "UiProject.archive"), "p2");
  await api.installProject(path.join(proj, "UiProject.cpmodproj"));
  const one = await api.deployMod(installed!.id);
  assert.equal(one?.waiting, 0, "deployMod left other changes waiting");
  assert.equal(fs.readFileSync(path.join(game, "archive", "pc", "mod", "UiProject.archive"), "utf8"), "p2", "deployMod did not relink the rebuilt file");

  await cfg.update("libraryPath", undefined, vscode.ConfigurationTarget.Global);
  await cfg.update("gamePath", undefined, vscode.ConfigurationTarget.Global);
  console.log("ui test: all passed");
}
