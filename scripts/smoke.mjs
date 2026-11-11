// Exercises the core end to end against a fake game folder in a temp directory: classify sample
// mod layouts, add them to a library, deploy (hardlinks), detect a change made outside EDGEdeck,
// undo, and import from a Vortex staging folder if one exists on this machine (read-only).
//   node scripts/smoke.mjs            after npm run build
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");
const root = path.resolve(import.meta.dirname, "..");
const sevenZa = core.findSevenZip(root);
assert.ok(sevenZa, "7za.exe not found; run npm run build");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edgedeck-smoke-"));
const game = path.join(tmp, "game");
const libRoot = path.join(tmp, "lib");
const src = path.join(tmp, "src");
fs.mkdirSync(path.join(game, "bin", "x64"), { recursive: true });
fs.writeFileSync(path.join(game, "bin", "x64", "Cyberpunk2077.exe"), "not really");
fs.mkdirSync(path.join(game, "archive", "pc", "mod"), { recursive: true });
fs.mkdirSync(path.join(game, "r6", "scripts"), { recursive: true });
fs.writeFileSync(path.join(game, "r6", "scripts", "UserOwn.reds"), "// the user's own file");

const write = (p, content = p) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const zip = (name, folder) => {
  const file = path.join(tmp, name);
  execFileSync(sevenZa, ["a", "-tzip", file, path.join(folder, "*")], { stdio: "ignore" });
  return file;
};

// Sample mods in the layouts Nexus actually ships.
write(path.join(src, "bare", "CoolMod.archive"));
write(path.join(src, "bare", "readme.txt"));
write(path.join(src, "rooted", "archive", "pc", "mod", "Rooted.archive"));
write(path.join(src, "rooted", "archive", "pc", "mod", "Rooted.archive.xl"));
write(path.join(src, "rooted", "r6", "scripts", "Rooted", "Rooted.reds"));
write(path.join(src, "rooted", "r6", "tweaks", "Rooted", "rooted.yaml"));
write(path.join(src, "cet", "MyCetMod", "init.lua"));
write(path.join(src, "cet", "MyCetMod", "data", "x.json"));
write(path.join(src, "options", "Option A", "Thing.archive"));
write(path.join(src, "options", "Option B", "Thing.archive"));
write(path.join(src, "conflict", "archive", "pc", "mod", "CoolMod.archive"), "other content");
write(path.join(src, "loose", "Loose.reds"));
write(path.join(src, "red4ext", "red4ext", "plugins", "Plug", "Plug.dll"));
write(path.join(src, "redmod", "MyRedmod", "info.json"), '{"name":"MyRedmod"}');
write(path.join(src, "redmod", "MyRedmod", "archives", "x.archive"));
write(path.join(src, "framework", "bin", "x64", "winmm.dll"));
write(path.join(src, "framework", "red4ext", "RED4ext.dll"));
write(path.join(src, "rednode", "edgebuilder", "rednode-app.json"), '{"id":"edgebuilder","name":"EDGEbuilder","entry":"index.html","main":"mod.mjs"}');
write(path.join(src, "rednode", "edgebuilder", "index.html"));
write(path.join(src, "rednode", "edgebuilder", "mod.mjs"));
write(path.join(src, "rednode", "edgebuilder", "node_modules", "dep", "index.js"));
write(path.join(src, "rednode-rooted", "red4ext", "plugins", "REDnode", "apps", "coords", "rednode-app.json"), '{"id":"coords"}');
write(path.join(src, "rednode-rooted", "red4ext", "plugins", "REDnode", "apps", "coords", "index.html"));
write(path.join(src, "rednode-itself", "red4ext", "plugins", "REDnode", "REDnode.dll"));
write(path.join(src, "rednode-itself", "red4ext", "plugins", "REDnode", "host", "REDnode-overlay.exe"));

const cls = (folder, name) => core.classify(path.join(src, folder), name);
let c = cls("bare", "Bare");
assert.deepEqual(c.placements.map((p) => p.to), ["archive/pc/mod/CoolMod.archive"]);
assert.deepEqual(c.ignored, ["readme.txt"]);
c = cls("rooted", "Rooted");
assert.equal(c.placements.length, 4);
assert.deepEqual([...c.kinds].sort(), ["archive", "reds", "tweak", "xl"]);
c = cls("cet", "Cet");
assert.deepEqual(c.placements.map((p) => p.to).sort(), ["bin/x64/plugins/cyber_engine_tweaks/mods/MyCetMod/data/x.json", "bin/x64/plugins/cyber_engine_tweaks/mods/MyCetMod/init.lua"]);
c = cls("options", "Options");
assert.deepEqual(c.options.map((o) => o.label), ["Option A", "Option B"]);
c = core.classify(c.options[1].folder, "Options");
assert.deepEqual(c.placements.map((p) => p.to), ["archive/pc/mod/Thing.archive"]);
c = cls("rednode", "EDGEbuilder 0.1");
assert.deepEqual(c.kinds, ["rednode"]);
assert.deepEqual(c.placements.map((p) => p.to).sort(), [
  "red4ext/plugins/REDnode/apps/edgebuilder/index.html",
  "red4ext/plugins/REDnode/apps/edgebuilder/mod.mjs",
  "red4ext/plugins/REDnode/apps/edgebuilder/node_modules/dep/index.js",
  "red4ext/plugins/REDnode/apps/edgebuilder/rednode-app.json",
], "a loose REDnode package goes into REDnode's apps folder under its manifest id");
c = cls("rednode-rooted", "Coords");
assert.deepEqual(c.kinds, ["rednode"]);
assert.ok(c.placements.every((p) => p.to.startsWith("red4ext/plugins/REDnode/apps/coords/")));
c = cls("rednode-itself", "REDnode");
assert.deepEqual(c.kinds, ["framework"], "REDnode itself is a framework, not a package");
c = cls("loose", "Loose");
assert.deepEqual(c.placements.map((p) => p.to), ["r6/scripts/Loose/Loose.reds"]);
c = cls("red4ext", "Plug");
assert.deepEqual(c.placements.map((p) => p.to), ["red4ext/plugins/Plug/Plug.dll"]);
c = cls("redmod", "MyRedmod");
assert.deepEqual(c.placements.map((p) => p.to).sort(), ["mods/MyRedmod/archives/x.archive", "mods/MyRedmod/info.json"]);
c = cls("framework", "RED4ext");
assert.deepEqual(c.kinds, ["framework"]);
console.log("classifier: ok");

// Extract a zip and add from it.
const lib = core.loadLibrary(libRoot, game);
const zipped = zip("rooted.zip", path.join(src, "rooted"));
const extracted = path.join(tmp, "extracted");
await core.extractArchive(zipped, extracted, sevenZa);
c = core.classify(extracted, "Rooted");
const rooted = core.addMod(lib, c.placements, { name: "Rooted", version: "1.0", source: { type: "file", path: zipped } });
assert.equal(rooted.files.length, 4);
const bare = core.addMod(lib, cls("bare", "Bare").placements, { name: "Bare", source: { type: "folder" } });
const conflict = core.addMod(lib, cls("conflict", "Conflict").placements, { name: "Conflict", source: { type: "folder" } });
const loose = core.addMod(lib, cls("loose", "Loose").placements, { name: "Loose", source: { type: "folder" } });
assert.ok(fs.existsSync(path.join(libRoot, "library", "rooted", "archive", "pc", "mod", "Rooted.archive")));
console.log("library: ok");

// Plan: Bare and Conflict both ship CoolMod.archive; Bare is earlier in the order so it wins.
let p = core.plan(lib, game);
assert.equal(p.conflicts.length, 1);
assert.equal(p.conflicts[0].winner, "bare");
assert.deepEqual(p.conflicts[0].losers, ["conflict"]);
assert.equal(p.method, "link");
const r = core.deploy(lib, game, new Map());
assert.equal(r.linked, 7, `linked ${r.linked}: 4 rooted + 1 bare + 1 loose + modlist`);
assert.equal(r.skipped.length, 0);
// The deploy report: every change listed, mods counted without EDGEdeck's own modlist.txt.
assert.equal(r.changes.length, 7);
assert.ok(r.changes.every((c) => c.kind === "added"));
assert.equal(core.modsTouched(r).length, 3, "rooted, bare, loose");
assert.equal(r.modsInGame, 3);
{
  const report = core.writeDeployReport(lib, game, r);
  const text = fs.readFileSync(report, "utf8");
  assert.ok(text.includes("7 files put in or replaced for 3 mods"), text.split("\n").slice(0, 6).join("\n"));
  assert.ok(text.includes("`archive/pc/mod/modlist.txt`"), "paths listed");
  assert.ok(text.includes("## EDGEdeck (load order files)"));
  console.log("deploy report: ok");
}

// A single .archive file, added on its own, and modlist.txt following on the next deploy.
{
  const loose = path.join(tmp, "loose-add");
  fs.mkdirSync(loose, { recursive: true });
  const file = path.join(loose, "SoloMod.archive");
  fs.writeFileSync(file, "RDAR solo");
  const unpacked = path.join(tmp, "loose-unpacked");
  await core.unpackOrCopy(file, unpacked, sevenZa);
  const c = core.classify(unpacked, "SoloMod");
  assert.deepEqual(c.placements.map((p) => p.to), ["archive/pc/mod/SoloMod.archive"], "a bare .archive goes to archive/pc/mod");
  const before = core.deploy(lib, game);
  const listed = () => fs.readFileSync(path.join(game, ...core.ModListPath.split("/")), "utf8").split("\r\n").filter(Boolean);
  const was = listed();
  const solo = core.addMod(lib, c.placements, { name: "SoloMod", source: { type: "file", path: file } });
  assert.ok(core.plan(lib, game).add.some((d) => d.rel === core.ModListPath), "modlist.txt is due when an archive arrives");
  core.deploy(lib, game);
  assert.deepEqual(listed(), [...was, "SoloMod.archive"], "the new archive is in modlist.txt");
  core.removeMod(lib, solo);
  core.deploy(lib, game);
  assert.deepEqual(listed(), was, "and out again when it goes");
  assert.equal(core.plan(lib, game).add.length, 0, "nothing left to do");
  assert.ok(before);
  console.log("single file and modlist: ok");
}
const modlist = fs.readFileSync(path.join(game, "archive", "pc", "mod", "modlist.txt"), "utf8");
assert.equal(modlist, "Rooted.archive\r\nCoolMod.archive\r\n");
assert.equal(fs.readFileSync(path.join(game, "archive", "pc", "mod", "CoolMod.archive"), "utf8").endsWith("CoolMod.archive"), true, "Bare's copy, not Conflict's");
assert.ok(fs.existsSync(path.join(game, core.ManifestName)));
assert.equal(fs.statSync(path.join(game, "archive", "pc", "mod", "Rooted.archive")).nlink, 2, "hardlinked");
console.log("deploy: ok", r);

// Nothing to do on a second deploy.
p = core.plan(lib, game);
assert.equal(p.add.length, 0);
assert.equal(p.stale.length, 0);

// Reorder: Conflict wins now, so CoolMod.archive is replaced.
core.moveMod(lib, conflict, -1);
core.moveMod(lib, conflict, -1);
assert.equal(lib.info.order[0], "conflict");
p = core.plan(lib, game);
assert.equal(p.conflicts[0].winner, "conflict");
core.deploy(lib, game);
assert.equal(fs.readFileSync(path.join(game, "archive", "pc", "mod", "CoolMod.archive"), "utf8"), "other content");
console.log("reorder: ok");

// A change made outside EDGEdeck: replace a deployed file with a different one.
const changedFile = path.join(game, "r6", "scripts", "Loose", "Loose.reds");
fs.rmSync(changedFile);
fs.writeFileSync(changedFile, "edited by hand");
let changes = core.detectChanges(game);
assert.deepEqual(changes.map((x) => [x.entry.path, x.kind]), [["r6/scripts/Loose/Loose.reds", "changed"]]);
// Deploy without an answer leaves it alone.
let r2 = core.deploy(lib, game);
assert.deepEqual(r2.skipped, ["r6/scripts/Loose/Loose.reds"]);
assert.equal(fs.readFileSync(changedFile, "utf8"), "edited by hand");
// "keep" imports the edit into the library and relinks.
r2 = core.deploy(lib, game, new Map([["r6/scripts/Loose/Loose.reds", "keep"]]));
assert.equal(fs.readFileSync(path.join(libRoot, "library", "loose", "r6", "scripts", "Loose", "Loose.reds"), "utf8"), "edited by hand");
assert.equal(fs.statSync(changedFile).nlink, 2);
assert.equal(core.detectChanges(game).length, 0);
// A missing file comes back silently.
fs.rmSync(changedFile);
assert.equal(core.detectChanges(game)[0].kind, "missing");
core.deploy(lib, game);
assert.ok(fs.existsSync(changedFile));
console.log("changes: ok");

// A rebuilt mod: the library file is replaced (new inode), and deploy relinks it without asking.
{
  const libFile = path.join(libRoot, "library", "loose", "r6", "scripts", "Loose", "Loose.reds");
  fs.rmSync(libFile);
  fs.writeFileSync(libFile, "rebuilt");
  const p2 = core.plan(lib, game);
  assert.deepEqual(p2.add.map((d) => d.rel), ["r6/scripts/Loose/Loose.reds"]);
  assert.ok(core.detectChanges(game).every((c) => c.kind !== "changed"), "the game file itself did not change (its old source is just gone)");
  const r3 = core.deploy(lib, game);
  assert.equal(r3.linked, 1);
  assert.equal(fs.readFileSync(changedFile, "utf8"), "rebuilt");
  assert.equal(fs.statSync(changedFile).nlink, 2);
  console.log("rebuilt: ok");
}

// A copy with the same bytes over a hardlinked file (REDnode's swap, EDGEdeck #13): no question, relinked.
{
  const gameCopy = path.join(game, "r6", "scripts", "Loose", "Loose.reds");
  const bytes = fs.readFileSync(gameCopy);
  fs.rmSync(gameCopy);
  fs.writeFileSync(gameCopy, bytes);
  assert.equal(fs.statSync(gameCopy).nlink, 1, "a copy now, not the link");
  assert.deepEqual(core.detectChanges(game).map((x) => [x.entry.path, x.kind]), [["r6/scripts/Loose/Loose.reds", "copied"]]);
  const p2 = core.plan(lib, game);
  assert.deepEqual(p2.add.map((d) => d.rel), ["r6/scripts/Loose/Loose.reds"]);
  assert.match(core.pendingChanges(lib, game, p2)[0].detail, /same bytes/);
  const r3 = core.deploy(lib, game);
  assert.deepEqual(r3.skipped, [], "deploy did not ask");
  assert.equal(fs.statSync(gameCopy).nlink, 2, "linked again");
  assert.equal(core.detectChanges(game).length, 0);
  // Same size, other bytes: still a change, and deploy still asks.
  const other = Buffer.from(bytes);
  other[0] ^= 1;
  fs.rmSync(gameCopy);
  fs.writeFileSync(gameCopy, other);
  assert.equal(core.detectChanges(game)[0].kind, "changed");
  assert.deepEqual(core.deploy(lib, game).skipped, ["r6/scripts/Loose/Loose.reds"]);
  core.deploy(lib, game, new Map([["r6/scripts/Loose/Loose.reds", "restore"]]));
  assert.deepEqual(fs.readFileSync(gameCopy), bytes, "the mod's file is back");
  assert.equal(core.detectChanges(game).length, 0);
  console.log("same bytes copied over: ok");
}

// One mod's deploy (REDcode's Install, EDGEdeck #2): its files go in, other mods' changes wait,
// modlist.txt lists only what is in the game, and the manifest stays true.
{
  const listed = () => fs.readFileSync(path.join(game, ...core.ModListPath.split("/")), "utf8").split("\r\n").filter(Boolean);
  const was = listed();
  write(path.join(src, "one-a", "archive", "pc", "mod", "OneA.archive"), "a");
  write(path.join(src, "one-a", "r6", "scripts", "OneA", "OneA.reds"), "a");
  write(path.join(src, "one-b", "archive", "pc", "mod", "OneB.archive"), "b");
  write(path.join(src, "one-c", "archive", "pc", "mod", "OneA.archive"), "c");
  const a = core.addMod(lib, cls("one-a", "OneA").placements, { name: "OneA", source: { type: "folder" } });
  const b = core.addMod(lib, cls("one-b", "OneB").placements, { name: "OneB", source: { type: "folder" } });
  const r1 = core.deploy(lib, game, new Map(), undefined, undefined, a.id);
  assert.ok(fs.existsSync(path.join(game, "archive", "pc", "mod", "OneA.archive")));
  assert.ok(!fs.existsSync(path.join(game, "archive", "pc", "mod", "OneB.archive")), "the other mod waits");
  assert.equal(r1.waiting, 1);
  assert.deepEqual(listed(), [...was, "OneA.archive"], "modlist.txt lists what is in the game");
  assert.deepEqual(core.pendingChanges(lib, game, core.plan(lib, game)).filter((c) => c.mod !== "edgedeck").map((c) => c.mod), [b.id], "only the other mod is pending");
  assert.ok(core.readManifest(game).files.some((e) => e.mod === a.id && e.path === "r6/scripts/OneA/OneA.reds"));
  // Another mod now wins a path this mod has in the game: the path goes to the winner, and lost says so.
  const cMod = core.addMod(lib, cls("one-c", "OneC").placements, { name: "OneC", source: { type: "folder" } });
  core.placeAbove(lib, cMod, a);
  const r2 = core.deploy(lib, game, new Map(), undefined, undefined, a.id);
  assert.equal(fs.readFileSync(path.join(game, "archive", "pc", "mod", "OneA.archive"), "utf8"), "c");
  assert.deepEqual(r2.lost.filter((l) => l.mod === a.id), [{ mod: a.id, files: 1, winner: cMod.id }]);
  // Turned off, one mod's deploy takes its files out and leaves the rest.
  a.enabled = false;
  core.saveMod(lib, a);
  core.deploy(lib, game, new Map(), undefined, undefined, a.id);
  assert.ok(!fs.existsSync(path.join(game, "r6", "scripts", "OneA", "OneA.reds")));
  assert.ok(!fs.existsSync(path.join(game, "archive", "pc", "mod", "OneB.archive")), "still waiting");
  for (const m of [a, b, cMod]) core.removeMod(lib, m);
  core.deploy(lib, game);
  assert.deepEqual(listed(), was);
  assert.equal(core.plan(lib, game).add.length + core.plan(lib, game).stale.length, 0, "a full deploy settles everything");
  console.log("deploy one mod: ok");
}

// A project: its packed folder is the mod; packing again refreshes the library copy.
{
  const proj = path.join(tmp, "proj");
  write(path.join(proj, "TestMod.cpmodproj"), "<CP77Mod><Name>TestMod</Name><ModName>Test Mod</ModName></CP77Mod>");
  write(path.join(proj, "packed", "archive", "pc", "mod", "TestMod.archive"), "v1");
  assert.equal(core.findProjectFile(proj), path.join(proj, "TestMod.cpmodproj"));
  assert.equal(core.projectName(path.join(proj, "TestMod.cpmodproj")), "Test Mod");
  const c2 = core.classifyProject(path.join(proj, "TestMod.cpmodproj"));
  const pm = core.addMod(lib, c2.placements, { name: "Test Mod", version: "dev", source: { type: "project", path: path.join(proj, "TestMod.cpmodproj") } });
  assert.deepEqual(pm.files, ["archive/pc/mod/TestMod.archive"]);
  assert.deepEqual(core.syncProjects(lib), [], "nothing changed yet");
  await new Promise((r) => setTimeout(r, 1100));
  write(path.join(proj, "packed", "archive", "pc", "mod", "TestMod.archive"), "v2");
  write(path.join(proj, "packed", "r6", "tweaks", "TestMod", "x.yaml"), "y");
  const synced = core.syncProjects(lib);
  assert.deepEqual(synced.map((m) => m.id), ["test-mod"]);
  assert.deepEqual(pm.files, ["archive/pc/mod/TestMod.archive", "r6/tweaks/TestMod/x.yaml"]);
  assert.equal(fs.readFileSync(path.join(libRoot, "library", "test-mod", "archive", "pc", "mod", "TestMod.archive"), "utf8"), "v2");
  // A pack that only removes a file re-syncs too: no file is newer, but the list changed.
  assert.deepEqual(core.syncProjects(lib), [], "nothing changed since");
  fs.rmSync(path.join(proj, "packed", "r6"), { recursive: true });
  assert.deepEqual(core.syncProjects(lib).map((m) => m.id), ["test-mod"], "a removal re-syncs");
  assert.deepEqual(pm.files, ["archive/pc/mod/TestMod.archive"]);
  assert.ok(!fs.existsSync(path.join(libRoot, "library", "test-mod", "r6", "tweaks", "TestMod", "x.yaml")), "the removed file leaves the library copy");
  assert.deepEqual(core.syncProjects(lib), [], "and once is enough");
  // A mod from before lists were kept gets one quietly, without a re-sync.
  delete pm.packedList;
  assert.deepEqual(core.syncProjects(lib), [], "no list yet: no re-sync");
  assert.ok(pm.packedList, "the list is recorded");
  core.removeMod(lib, pm);
  console.log("project: ok");

  // installProject, REDcode's Install: adds once, then refreshes the same mod in place, whatever the file times.
  const projectFile = path.join(proj, "TestMod.cpmodproj");
  const first = core.installProject(lib, projectFile);
  assert.equal(first.added, true);
  assert.equal(first.mod.version, "dev");
  assert.equal(first.mod.enabled, true);
  const order = lib.info.order.indexOf(first.mod.id);
  first.mod.enabled = false;
  fs.rmSync(path.join(proj, "packed", "r6"), { recursive: true, force: true });
  write(path.join(proj, "packed", "archive", "pc", "mod", "TestMod.archive"), "v3");
  const again = core.installProject(lib, projectFile);
  assert.equal(again.added, false);
  assert.equal(again.mod.id, first.mod.id, "the same mod, not a new version");
  assert.equal(again.mod.enabled, true, "turned back on");
  assert.equal(lib.info.order.indexOf(again.mod.id), order, "keeps its place in the order");
  assert.deepEqual(again.mod.files, ["archive/pc/mod/TestMod.archive"], "files the project no longer makes are gone");
  assert.equal(fs.readFileSync(path.join(libRoot, "library", again.mod.id, "archive", "pc", "mod", "TestMod.archive"), "utf8"), "v3");
  assert.equal(lib.mods.filter((m) => m.source.type === "project").length, 1);
  const verb = core.verbs.installProject({ lib, libraryRoot: libRoot, game: "" }, projectFile);
  assert.equal(verb.data.added, false);
  console.log("install project: ok");

  // A second project folder with the same mod name (EDGEdeck #3): without an answer it is a mod of
  // its own and loses the shared file; Keep both makes it another version, on in the first one's
  // place; Use this project moves the first mod over to it.
  const proj2 = path.join(tmp, "proj2");
  const projectFile2 = path.join(proj2, "TestMod.cpmodproj");
  write(projectFile2, "<CP77Mod><Name>TestMod</Name><ModName>Test Mod</ModName></CP77Mod>");
  write(path.join(proj2, "packed", "archive", "pc", "mod", "TestMod.archive"), "w2");
  const a = again.mod;
  assert.equal(core.sameNameMod(lib, projectFile2)?.id, a.id);
  assert.equal(core.sameNameMod(lib, projectFile), undefined, "the project's own mod is not a same-name mod");
  const separate = core.installProject(lib, projectFile2).mod;
  assert.notEqual(separate.id, a.id);
  const noGame = path.join(tmp, "no-game");
  const lost = core.lostFiles(core.plan(lib, noGame)).filter((l) => l.mod === separate.id);
  assert.deepEqual(lost, [{ mod: separate.id, files: 1, winner: a.id }], "the newer folder loses to the one above it");
  assert.match(core.verbs.installProject({ lib, libraryRoot: libRoot, game: "" }, projectFile).text, /refreshed/);
  core.removeMod(lib, separate);
  assert.match(core.verbs.installProject({ lib, libraryRoot: libRoot, game: "" }, projectFile2).text, /also has test-mod/);
  core.removeMod(lib, lib.mods.find((m) => m.source.path === projectFile2));

  const both = core.installProject(lib, projectFile2, { mod: a, how: "version" });
  assert.equal(both.mod.version, "dev 2");
  assert.equal(both.mod.enabled, true);
  assert.equal(a.enabled, false, "the other version goes off");
  assert.ok(lib.info.order.indexOf(both.mod.id) < lib.info.order.indexOf(a.id), "in the first one's place");
  assert.deepEqual(core.familyOf(lib, a).mods.map((m) => m.id).sort(), [a.id, both.mod.id].sort(), "one family");
  assert.equal(core.lostFiles(core.plan(lib, noGame)).filter((l) => l.mod === both.mod.id || l.mod === a.id).length, 0);
  // Installing the first folder again turns it on in the family's place, the other version off.
  core.installProject(lib, projectFile);
  assert.equal(a.enabled, true);
  assert.equal(both.mod.enabled, false);
  core.removeMod(lib, both.mod);

  const follow = core.installProject(lib, projectFile2, { mod: a, how: "follow" });
  assert.equal(follow.mod.id, a.id, "no second mod");
  assert.equal(follow.added, false);
  assert.equal(a.source.path, projectFile2);
  assert.equal(fs.readFileSync(path.join(libRoot, "library", a.id, "archive", "pc", "mod", "TestMod.archive"), "utf8"), "w2");
  assert.equal(core.familyKey(a), `project:${projectFile.toLowerCase()}`, "its family and section stay");
  assert.equal(core.sameNameMod(lib, projectFile2), undefined);
  core.removeMod(lib, a);
  console.log("install project beside a mod of the same name: ok");
}

// Sizes: per file, per mod, and the library's totals.
{
  const m = lib.mods.find((x) => x.files.length);
  const sz = core.modSize(lib, m);
  assert.equal(sz.files.size, m.files.length);
  assert.equal(sz.total, [...sz.files.values()].reduce((a, b) => a + b, 0));
  assert.ok(sz.total > 0);
  const tot = core.librarySize(lib);
  assert.ok(tot.mods >= sz.total);
  assert.equal(core.formatBytes(1536), "2 KB");
  assert.equal(core.formatBytes(1.5 * (1 << 20)), "1.5 MB");
  assert.equal(core.formatBytes(12 * (1 << 30)), "12 GB");
  console.log(`sizes: ok (${core.formatBytes(tot.mods)} in mods, ${core.formatBytes(tot.downloads)} in downloads)`);
}

// Pending changes with reasons: a replaced path is one row, an off mod's files are removes.
{
  const p0 = core.plan(lib, game);
  const before = core.pendingChanges(lib, game, p0);
  const deployedIds = new Set(core.readManifest(game).files.map((e) => e.mod));
  const off = lib.mods.find((m) => m.enabled && deployedIds.has(m.id) && m.files.every((f) => !p0.conflicts.some((c) => c.path.toLowerCase() === f.toLowerCase())));
  off.enabled = false;
  core.saveMod(lib, off);
  const rows = core.pendingChanges(lib, game, core.plan(lib, game));
  const removes = rows.filter((r) => r.kind === "remove" && r.mod === off.id);
  assert.ok(removes.length > 0, "off mod's deployed files are removes");
  assert.ok(removes.every((r) => r.detail === "the mod is off"));
  assert.ok(rows.every((r, i) => rows.filter((x) => x.path === r.path).length === 1), "one row per path");
  off.enabled = true;
  core.saveMod(lib, off);
  assert.equal(core.pendingChanges(lib, game, core.plan(lib, game)).length, before.length);
  console.log(`pending changes: ok (${removes.length} removes when ${off.id} is off)`);
}

// Families: versions of one mod grouped, one active, the rest off; ids carry the version.
{
  const a = core.addMod(lib, cls("bare", "Fam").placements, { name: "Codeware", version: "1.20.3", source: { type: "nexus", modId: 7780, fileId: 1 } });
  a.nexus = { name: "Codeware", version: "1.20.5", latestVersion: "1.20.5", latestFileId: 3, checked: "2026-10-12T00:00:00Z" };
  core.saveMod(lib, a);
  const b = core.addMod(lib, cls("bare", "Fam").placements, { name: "Codeware", version: "1.20.4", source: { type: "nexus", modId: 7780, fileId: 2 }, enabled: false });
  assert.equal(b.id, "codeware-1-20-4", "second version gets the version in its id");
  let fam = core.familyOf(lib, a);
  assert.equal(fam.mods.length, 2);
  assert.equal(fam.mods[0].id, b.id, "newest first");
  assert.equal(fam.active.id, a.id, "the enabled one is active");
  assert.equal(fam.update.version, "1.20.5");
  assert.equal(core.familyUpdate(lib, b), "1.20.5");
  assert.equal(core.findSameVersion(lib, 7780, 2).id, b.id);
  assert.equal(core.findSameVersion(lib, 7780, 99, "1.20.3").id, a.id);
  assert.equal(core.findSameVersion(lib, 7780, 99, "9.9.9"), undefined);
  const r = core.activateVersion(lib, b);
  assert.equal(r.previous.id, a.id);
  assert.ok(r.on);
  assert.ok(b.enabled && !a.enabled, "chosen on, previous off");
  assert.ok(lib.info.order.indexOf(b.id) < lib.info.order.indexOf(a.id), "chosen takes the previous one's place");
  fam = core.familyOf(lib, a);
  assert.equal(fam.active.id, b.id);
  assert.equal(core.families(lib).filter((f) => f.key === "nexus:7780").length, 1, "one row per mod");
  assert.equal(core.baseName("Codeware 1.20.5"), "codeware");
  assert.equal(core.baseName("input_loader_v0.2.3"), "input loader");
  core.removeMod(lib, a);
  core.removeMod(lib, b);
  // A new version of a REDnode package joins its family by the package id, whatever it is called,
  // takes the old one's place and on-state, and the old one goes off; an older one arrives off.
  {
    const pkg = (id, ver) => [{ from: path.join(tmp, `pkg-${ver}.json`), to: `red4ext/plugins/REDnode/apps/${id}/rednode-app.json`, kind: "rednode" }];
    for (const v of ["0.1.1", "0.2.0", "0.0.9"]) fs.writeFileSync(path.join(tmp, `pkg-${v}.json`), JSON.stringify({ id: "edgebuilder", name: "EDGEbuilder", version: v }));
    assert.deepEqual(core.rednodeManifest(pkg("edgebuilder", "0.2.0")), { id: "edgebuilder", name: "EDGEbuilder", version: "0.2.0" });
    // REDnode itself ships with apps: neither its name nor its family comes from the first of them.
    const bundle = [
      { from: path.join(tmp, "pkg-0.2.0.json"), to: "red4ext/plugins/REDnode/REDnode.dll", kind: "framework" },
      ...pkg("ask-mod", "0.2.0"),
      { from: path.join(tmp, "pkg-0.2.0.json"), to: "red4ext/plugins/REDnode/apps/timer/rednode-app.json", kind: "rednode" },
    ];
    assert.equal(core.rednodeManifest(bundle), undefined, "REDnode's own zip is not one app");
    assert.equal(core.rednodeManifest(bundle.filter((p) => !p.to.endsWith(".dll"))), undefined, "two apps are not one app");
    assert.equal(core.singleRednodeApp(bundle.slice(1, 2).map((p) => p.to)), "red4ext/plugins/REDnode/apps/ask-mod/rednode-app.json");
    assert.equal(core.rednodePackageId({ files: bundle.map((p) => p.to) }), undefined, "REDnode's family is not rednode:ask-mod");
    // A project that carries a copy of an app beside its own files is not that app.
    const carrier = ["mods/TestMod/info.json", "red4ext/plugins/REDnode/apps/edgebuilder/app.js", "red4ext/plugins/REDnode/apps/edgebuilder/rednode-app.json"];
    assert.equal(core.rednodePackageId({ files: carrier }), undefined, "TestMod is not grouped with EDGEbuilder");
    assert.equal(core.rednodePackageId({ files: carrier.slice(1) }), "edgebuilder", "the app alone is");
    const leftover = fs.mkdtempSync(path.join(tmp, "temp-"));
    fs.writeFileSync(path.join(leftover, "a.txt"), "a");
    assert.equal(core.removeTemp(leftover), undefined);
    assert.ok(!fs.existsSync(leftover), "removeTemp removes the folder");
    const first = core.addMod(lib, pkg("edgebuilder", "0.1.1"), { name: "EDGEbuilder", version: "0.1.1", source: { type: "folder", path: tmp } });
    assert.deepEqual(core.settleNewVersion(lib, first), {}, "the first version settles nothing");
    const second = core.addMod(lib, pkg("edgebuilder", "0.2.0"), { name: "edgebuilder-0.2.0", version: "0.2.0", source: { type: "folder", path: tmp } });
    assert.equal(core.familyKey(second), "rednode:edgebuilder");
    assert.equal(core.familyKey(second), core.familyKey(first), "one family, though the names differ");
    const r = core.settleNewVersion(lib, second);
    assert.equal(r.replaced?.id, first.id);
    assert.equal(second.enabled, true);
    assert.equal(lib.mods.find((m) => m.id === first.id).enabled, false, "the old version is off");
    assert.ok(lib.info.order.indexOf(second.id) < lib.info.order.indexOf(first.id), "the new version takes the old one's place");
    assert.equal(core.familiesWithTwoOn(lib).length, 0);
    const older = core.addMod(lib, pkg("edgebuilder", "0.0.9"), { name: "EDGEbuilder", version: "0.0.9", source: { type: "folder", path: tmp } });
    assert.equal(core.settleNewVersion(lib, older).older?.id, second.id);
    assert.equal(older.enabled, false, "an older version arrives off");
    // Two on from before: found, so deploy can ask.
    first.enabled = true;
    assert.equal(core.familiesWithTwoOn(lib).length, 1);
    first.enabled = false;
    for (const m of [first, second, older]) core.removeMod(lib, m);
  }
  console.log("families: ok");

  // File lines: a Nexus page with two main files and an optional one is three mods, each with its
  // own versions. Versions are linked by Nexus's update chain, else by the name without the version,
  // else a main file continues the one line the page no longer offers.
  {
    const f = (file_id, name, version, category_name, t) => ({ file_id, name, version, category_name, is_primary: false, uploaded_timestamp: t, file_name: `${file_id}.zip`, size_kb: 1 });
    const page = { files: [
      f(10, "Main File - Male", "1.0", "OLD_VERSION", 1),
      f(11, "Main File - Male", "1.1", "MAIN", 3),
      f(20, "Main File - Female", "1.1", "MAIN", 4),
      f(30, "Patch for Other Mod", "1.0", "OPTIONAL", 5),
    ], file_updates: [{ old_file_id: 10, new_file_id: 11, new_file_name: "11.zip", uploaded_timestamp: 3 }] };
    assert.ok(core.sameLine(page, { fileId: 10 }, { fileId: 11 }), "the update chain");
    assert.ok(!core.sameLine(page, { fileId: 11 }, { fileId: 20 }), "two main files");
    assert.ok(core.sameLine(page, { fileId: 999, title: "Main File - Male 1.0" }, { fileId: 11 }), "the name without the version");
    assert.equal(core.lineFor(page, { fileId: 11 }, [[{ fileId: 10 }]]), 0);
    assert.equal(core.lineFor(page, { fileId: 20 }, [[{ fileId: 11 }]]), undefined, "the other main file is a mod of its own");
    assert.equal(core.lineFor(page, { fileId: 30 }, [[{ fileId: 11 }]]), undefined, "so is the optional file");
    const renamed = { files: [f(1, "Old name", "1.0", "OLD_VERSION", 1), f(2, "New name", "2.0", "MAIN", 2)], file_updates: [] };
    assert.equal(core.lineFor(renamed, { fileId: 2 }, [[{ fileId: 1 }]]), 0, "a main file continues the retired line");
    assert.equal(core.lineFor(renamed, { fileId: 2 }, [[{ fileId: 1 }], [{ fileId: 7 }]]), undefined, "unless two lines are retired");
    assert.equal(core.newestInLine(page, { fileId: 10 }).file_id, 11);
    assert.equal(core.newestInLine(page, { fileId: 20 }).file_id, 20, "not the other main file");
    assert.equal(core.newestInLine(page, { fileId: 30 }).file_id, 30, "an optional file is not updated to a main one");
    assert.equal(core.newestInLine(page, { fileId: 777 }, [{ fileId: 20 }]).file_id, 11, "an unknown file: the one main file no other line has");
    assert.equal(core.newestInLine(page, { fileId: 777 }), undefined, "two candidates: no guess");
    assert.deepEqual(core.splitLines(page, [{ fileId: 10 }, { fileId: 11 }]), [0, 0]);
    assert.deepEqual(core.splitLines(page, [{ fileId: 11 }, { fileId: 20 }, { fileId: 10 }, { fileId: 30 }]), [0, 1, 0, 2]);
    assert.deepEqual(core.splitLines(renamed, [{ fileId: 1 }, { fileId: 2 }]), [0, 0], "a retired line's successor stays");
    assert.equal(core.lineName("Cool Mod", "Main File - Female 1.1"), "Cool Mod: Main File - Female");
    assert.equal(core.lineName("Cool Mod", "Cool Mod - Female v2.0"), "Cool Mod - Female");
    assert.equal(core.lineName("Cool Mod", "Cool Mod 1.1"), "Cool Mod");

    const male = core.addMod(lib, cls("bare", "Fam").placements, { name: "Cool Mod", version: "1.1", source: { type: "nexus", modId: 500, fileId: 11 } });
    assert.deepEqual(core.lineOfFile(lib, 500, 20, page), { key: "nexus:500:20", entries: [], newLine: true });
    const next = core.lineOfFile(lib, 500, 10, page);
    assert.equal(next.key, "nexus:500");
    assert.deepEqual(next.entries.map((m) => m.id), [male.id]);
    assert.equal(core.findSameVersion(lib, 500, 20, "1.1", "nexus:500:20"), undefined, "same version, other file: not in the library");
    assert.equal(core.findSameVersion(lib, 500, 99, "1.1").id, male.id);
    const female = core.addMod(lib, cls("bare", "Fam").placements, { name: "Cool Mod: Main File - Female", version: "1.1", source: { type: "nexus", modId: 500, fileId: 20 } });
    female.family = "nexus:500:20";
    core.saveMod(lib, female);
    assert.deepEqual(core.settleNewVersion(lib, female), {}, "a file of its own settles nothing");
    assert.ok(male.enabled && female.enabled, "both stay on");
    assert.equal(core.families(lib).filter((x) => x.nexusId === 500).length, 2, "two rows");
    assert.deepEqual(core.otherLineFiles(lib, male), [{ fileId: 20, title: undefined }]);
    core.removeMod(lib, female);

    // What an older EDGEdeck did: the female file became a version of the male one, under its name.
    const merged = core.addMod(lib, cls("bare", "Fam").placements, { name: "Cool Mod", version: "1.1", source: { type: "nexus", modId: 500, fileId: 20 } });
    assert.equal(core.familyOf(lib, merged).mods.length, 2, "merged, as before");
    lib.info.sectionOf = { ...(lib.info.sectionOf ?? {}), "nexus:500": "Visual" };
    assert.deepEqual(core.splitPage(lib, 500, page, "Cool Mod"), ["Cool Mod: Main File - Female"]);
    assert.equal(merged.family, "nexus:500:20");
    assert.equal(merged.name, "Cool Mod: Main File - Female");
    assert.equal(male.name, "Cool Mod", "the first file keeps its name");
    assert.equal(male.source.fileTitle, "Main File - Male", "the file's name filled in");
    assert.equal(lib.info.sectionOf["nexus:500:20"], "Visual", "in the same section");
    assert.deepEqual(core.splitPage(lib, 500, page, "Cool Mod"), [], "once");
    delete lib.info.sectionOf["nexus:500"];
    delete lib.info.sectionOf["nexus:500:20"];
    for (const m of [male, merged]) core.removeMod(lib, m);

    // Imported from Vortex: the page is known, the file is not (issue #4). A main file and an optional
    // one of the same page, as Vortex names their folders.
    const truck = { files: [
      { ...f(40, "Truck Simulator (Full version)", "4.1", "MAIN", 1700000010), file_name: "Truck Simulator (Full version)-600-4-1-1700000010.zip" },
      { ...f(41, "Job Invitation (Robot) - Optional", "2.1", "OPTIONAL", 1700000000), file_name: "Job Invitation (Robot) - Optional-600-2-1-1700000000.zip" },
    ], file_updates: [] };
    assert.equal(core.vortexFile(truck, "Job Invitation (Robot) - Optional-600-2-1-1700000000").file_id, 41, "older Vortex: the file's name");
    assert.equal(core.vortexFile(truck, "Robot Optional-600-2-1-1700000000").file_id, 41, "older Vortex: the upload time");
    assert.equal(core.vortexFile(truck, "Job Invitation (Robot) - Optional 600 2.1 2023-11-14T22-13Z aBc123XyZ").file_id, 41, "newer Vortex: the minute, then the version");
    assert.equal(core.vortexFile(truck, "Something 600 9.9 2023-11-14T22-13Z aBc123XyZ"), undefined, "two files that minute, neither version: no guess");
    assert.equal(core.vortexFile(truck, "Hand named"), undefined);
    assert.equal(core.onlyLine(truck, core.newestFile(truck)), undefined, "a page with an optional file: an unknown file gets no update");
    assert.equal(core.onlyLine(renamed, core.newestFile(renamed)).file_id, 2, "a page with one mod: its newest main file");
    const vMain = core.addMod(lib, cls("bare", "Fam").placements, { name: "Truck Simulator (Full version)", version: "4.1", source: { type: "vortex", modId: 600, path: path.join(tmp, "vortex", "Truck Simulator (Full version)-600-4-1-1700000010") } });
    const vOpt = core.addMod(lib, cls("bare", "Fam").placements, { name: "Job Invitation (Robot) - Optional", version: "2.1", source: { type: "vortex", modId: 600, path: path.join(tmp, "vortex", "Job Invitation (Robot) - Optional-600-2-1-1700000000") } });
    assert.equal(core.familyOf(lib, vOpt).mods.length, 2, "one family before the check, as in the issue");
    core.splitPage(lib, 600, truck, "Truck Simulator");
    assert.equal(vOpt.source.fileId, 41, "the optional file is found from its folder");
    assert.equal(vOpt.source.fileTitle, "Job Invitation (Robot) - Optional");
    assert.equal(vMain.source.fileId, 40, "and the main file");
    assert.equal(core.families(lib).filter((x) => x.nexusId === 600).length, 2, "two mods now, each with its own versions");
    assert.equal(core.newestInLine(truck, core.lineFile(vOpt), core.otherLineFiles(lib, vOpt)).file_id, 41, "the optional file's update is itself, not the main file");
    for (const m of [vMain, vOpt]) core.removeMod(lib, m);
    console.log("nexus file lines: ok");
  }

  // Rename: every version gets the name, the family stays one (its key pinned, so a name-keyed
  // family, its section and loadouts hold), a new version takes the name, and empty puts it back.
  {
    write(path.join(tmp, "ren", "archive", "pc", "mod", "Ren.archive"), "r");
    const placements = [{ from: path.join(tmp, "ren", "archive", "pc", "mod", "Ren.archive"), to: "archive/pc/mod/Ren.archive", kind: "archive" }];
    const v1 = core.addMod(lib, placements, { name: "Neon Signs 1.0", version: "1.0", source: { type: "folder" } });
    const v2 = core.addMod(lib, placements, { name: "Neon Signs 1.1", version: "1.1", source: { type: "folder" } });
    core.settleNewVersion(lib, v2);
    const key = core.familyKey(v1);
    assert.equal(key, "name:neon signs");
    lib.info.sectionOf = { ...(lib.info.sectionOf ?? {}), [key]: "Visual" };
    const fam = core.renameFamily(lib, v2, "Glowing Signs");
    assert.equal(fam.name, "Glowing Signs");
    assert.deepEqual([v1.name, v2.name], ["Glowing Signs", "Glowing Signs"], "every version");
    assert.deepEqual([v1.renamedFrom, v2.renamedFrom], ["Neon Signs 1.0", "Neon Signs 1.1"], "first names kept");
    assert.equal(core.familyKey(v1), key, "the family keeps its key");
    assert.equal(core.families(lib).filter((f) => f.key === key).length, 1, "still one family");
    assert.equal(lib.info.sectionOf[key], "Visual", "its section holds");
    const again = JSON.parse(fs.readFileSync(path.join(libRoot, "library", v1.id, "mod.json"), "utf8"));
    assert.equal(again.name, "Glowing Signs", "saved");
    // A new download under the old name joins the family and takes the new name.
    const v3 = core.addMod(lib, placements, { name: "Neon Signs 1.2", version: "1.2", source: { type: "folder" } });
    core.settleNewVersion(lib, v3);
    assert.equal(v3.name, "Glowing Signs");
    assert.equal(v3.renamedFrom, "Neon Signs 1.2");
    assert.equal(core.familyOf(lib, v3).mods.length, 3);
    assert.match(core.verbs.rename({ lib, libraryRoot: libRoot, game: "" }, v3.id, "").text, /Glowing Signs is now Neon Signs 1\.2/);
    assert.deepEqual([v1.name, v2.name, v3.name], ["Neon Signs 1.0", "Neon Signs 1.1", "Neon Signs 1.2"], "empty puts the first names back");
    assert.equal(v1.renamedFrom, undefined);
    delete lib.info.sectionOf[key];
    for (const m of [v1, v2, v3]) core.removeMod(lib, m);
    console.log("rename: ok");
  }
}

// placeAbove: the loser moves to directly above the winner; already-above is a no-op.
{
  const before = [...lib.info.order];
  const [first, , third] = lib.mods;
  core.placeAbove(lib, third, first);
  assert.equal(lib.info.order.indexOf(third.id), lib.info.order.indexOf(first.id) - 1);
  assert.equal(lib.mods[0].id, third.id);
  core.placeAbove(lib, third, first);
  assert.equal(lib.mods[0].id, third.id, "no-op when already above");
  lib.info.order = before;
  const rank = new Map(before.map((id, k) => [id, k]));
  lib.mods.sort((a, b) => rank.get(a.id) - rank.get(b.id));
  core.saveLibrary(lib);
  console.log("placeAbove: ok");
}

// Sections: a user section between Frameworks and Mods; moving, placing and turning a section on or off.
{
  const before = [...lib.info.order];
  const enabled = new Map(lib.mods.map((m) => [m.id, m.enabled]));
  const names = () => core.sectionsOf(lib).map((s) => s.name);
  const where = (m) => core.sectionsOf(lib).find((s) => s.families.some((f) => f.active.id === m.id))?.name;
  assert.equal(names().at(-1), "Mods", "Mods comes last");
  core.addSection(lib, "Visual");
  core.addSection(lib, "Gameplay");
  assert.throws(() => core.addSection(lib, "mods"), /already a section/);
  assert.throws(() => core.addSection(lib, "visual"), /already a section/);
  assert.deepEqual(names().slice(-3), ["Visual", "Gameplay", "Mods"]);
  const plain = lib.mods.filter((m) => !m.kinds.includes("framework"));
  assert.ok(plain.length >= 2, "the fake library has two plain mods");
  const [a, b] = plain;
  core.putInSection(lib, a, "Gameplay");
  core.putInSection(lib, b, "Gameplay");
  assert.equal(where(a), "Gameplay");
  const reread = core.loadLibrary(libRoot, game);
  assert.equal(reread.info.sectionOf[core.familyKey(a)], "Gameplay", "kept in library.json");
  // Moving within the section: the two swap, whatever sits between them elsewhere.
  const fam = () => core.sectionsOf(lib).find((s) => s.name === "Gameplay").families.map((f) => f.active.id);
  const top = fam()[0];
  assert.equal(core.moveInSection(lib, lib.mods.find((m) => m.id === top), -1), false, "the first cannot go up");
  assert.ok(core.moveInSection(lib, lib.mods.find((m) => m.id === top), 1));
  assert.equal(fam()[1], top, "moved down past its neighbour");
  // Placing next to a mod in another section moves it there too.
  const other = lib.mods.find((m) => m.id !== a.id && m.id !== b.id && !m.kinds.includes("framework"));
  if (other) {
    core.placeNextTo(lib, other, a, true);
    assert.equal(where(other), "Gameplay");
    assert.equal(lib.info.order.indexOf(other.id), lib.info.order.indexOf(a.id) + 1, "directly below");
    core.putInSection(lib, other, "Mods");
    assert.equal(lib.info.sectionOf[core.familyKey(other)], undefined, "back where its kinds put it: no entry");
  }
  // A section's box.
  core.setSectionOn(lib, "Gameplay", false);
  assert.ok(!a.enabled && !b.enabled);
  core.setSectionOn(lib, "Gameplay", true);
  assert.ok(a.enabled && b.enabled);
  core.moveSection(lib, "Gameplay", -1);
  assert.deepEqual(names().slice(-3), ["Gameplay", "Visual", "Mods"]);
  core.renameSection(lib, "Gameplay", "Play");
  assert.equal(where(a), "Play");
  core.deleteSection(lib, "Play");
  core.deleteSection(lib, "Visual");
  assert.equal(where(a), "Mods", "back in Mods");
  assert.deepEqual(lib.info.sections, []);
  for (const m of lib.mods) if (m.enabled !== enabled.get(m.id)) { m.enabled = enabled.get(m.id); core.saveMod(lib, m); }
  lib.info.order = before;
  const rank = new Map(before.map((id, k) => [id, k]));
  lib.mods.sort((x, y) => rank.get(x.id) - rank.get(y.id));
  core.saveLibrary(lib);
  console.log("sections: ok");
}

// Page groups: two files of one Nexus page (here -KS- UV Texture Framework, mod 3783, as its page
// had them on 2026-11-02) under one parent row. The group keeps together in the order, sits in one
// section, moves as one; its files move only among themselves; the box remembers what was on.
{
  const before = [...lib.info.order];
  const f = (file_id, name, version, category_name, t) => ({ file_id, name, version, category_name, is_primary: false, uploaded_timestamp: t, file_name: `${file_id}.zip`, size_kb: 1 });
  const uv = { files: [
    f(79361, "2. UV Framework 3.2.1 Classic install", "3.2.1", "OLD_VERSION", 1),
    f(81119, "UV4 Prelim Release (Supports ALL female bodies)", "4.0", "OLD_VERSION", 2),
    f(116256, "1. UV Framework 4.1", "4.1", "OLD_VERSION", 3),
    f(116258, "2. (OPTIONAL) UV HQ Arms", "1.0", "ARCHIVED", 4),
    f(116264, "2. (OPTIONAL) UV HQ Arms", "1.1", "MAIN", 5),
    f(116788, "1. UV Framework 4.1", "4.1", "MAIN", 6),
    f(27051, "Nanarc's Arm Tattoo Overlays", "1.0", "OPTIONAL", 0),
  ], file_updates: [[79361, 116256], [116256, 116263], [116263, 116268], [116268, 116788], [116258, 116264]].map(([o, n]) => ({ old_file_id: o, new_file_id: n, new_file_name: "", uploaded_timestamp: 0 })) };
  assert.equal(core.lineFor(uv, { fileId: 116264 }, [[{ fileId: 116788 }]]), undefined, "HQ Arms is a mod of its own");
  assert.equal(core.lineFor(uv, { fileId: 116788 }, [[{ fileId: 81119 }]]), 0, "4.1 follows the retired 4.0 prelim");
  assert.equal(core.newestInLine(uv, { fileId: 79361 }).file_id, 116788, "Classic install 3.2.1 became UV Framework 4.1");
  assert.equal(core.newestInLine(uv, { fileId: 116258 }).file_id, 116264);
  assert.equal(core.newestInLine(uv, { fileId: 27051 }).file_id, 27051);
  assert.equal(core.fileLabel("2. (OPTIONAL) UV HQ Arms"), "(OPTIONAL) UV HQ Arms");
  assert.equal(core.lineName("-KS- UV Texture Framework", "2. (OPTIONAL) UV HQ Arms"), "-KS- UV Texture Framework: (OPTIONAL) UV HQ Arms");

  const page = "-KS- UV Texture Framework";
  const nexus = { name: page, version: "4.1", latestVersion: "", latestFileId: 0, latestFileName: "", checked: "2026-11-02T00:00:00Z" };
  const add = (name, version, fileId, fileTitle, family) => {
    const m = core.addMod(lib, cls("bare", "Fam").placements, { name, version, source: { type: "nexus", modId: 3783, fileId, fileTitle } });
    m.nexus = nexus;
    if (family) m.family = family;
    core.saveMod(lib, m);
    return m;
  };
  const fw = add(page, "4.1", 116788, "1. UV Framework 4.1");
  const between = core.addMod(lib, cls("bare", "Fam").placements, { name: "Between", version: "1.0", source: { type: "folder" } });
  const arms = add(`${page}: (OPTIONAL) UV HQ Arms`, "1.1", 116264, "2. (OPTIONAL) UV HQ Arms", "nexus:3783:116258");
  const groups = () => core.pageGroups(core.families(lib));
  assert.equal(groups().length, 1);
  const g = groups()[0];
  assert.equal(g.key, "page:3783");
  assert.equal(g.name, page);
  assert.deepEqual(g.families.map((x) => core.childName(g, x)), ["UV Framework", "(OPTIONAL) UV HQ Arms"]);
  assert.ok(core.gatherGroups(lib), "the order changes");
  const at = (m) => lib.info.order.indexOf(m.id);
  assert.deepEqual([at(arms) - at(fw), at(between) - at(arms)], [1, 1], "the page's files together, the other mod below them");
  assert.equal(core.gatherGroups(lib), false, "once");
  const mods = () => core.sectionsOf(lib).find((s) => s.name === "Mods");
  assert.deepEqual(mods().groups.map((x) => x.key), ["page:3783"]);

  // The box: off and remember, then back on with what was on.
  const fam = (m) => core.families(lib).find((x) => x.key === core.familyKey(m));
  let choice = core.groupToggle(lib, groups()[0]);
  assert.deepEqual([choice.on, choice.families.length], [false, 2]);
  core.setFamiliesOn(lib, choice.families, false);
  assert.ok(!fw.enabled && !arms.enabled);
  assert.equal(core.groupState(groups()[0]), "none");
  choice = core.groupToggle(lib, groups()[0]);
  assert.deepEqual([choice.on, choice.families.map((x) => x.key).sort()], [true, [core.familyKey(fw), core.familyKey(arms)].sort()], "both were on");
  core.setFamiliesOn(lib, [fam(arms)], true);
  assert.equal(core.groupState(groups()[0]), "some");
  core.setFamiliesOn(lib, core.groupToggle(lib, groups()[0]).families, false);
  choice = core.groupToggle(lib, groups()[0]);
  assert.deepEqual(choice.families.map((x) => x.key), [core.familyKey(arms)], "only the one that was on");
  core.setFamiliesOn(lib, choice.families, true);
  assert.ok(arms.enabled && !fw.enabled);

  // One section for the group; its files move among themselves; other mods move past the whole group.
  core.addSection(lib, "Bodies");
  core.putInSection(lib, arms, "Bodies");
  assert.deepEqual([lib.info.sectionOf[core.familyKey(fw)], lib.info.sectionOf[core.familyKey(arms)]], ["Bodies", "Bodies"], "the whole group");
  const bodies = () => core.sectionsOf(lib).find((s) => s.name === "Bodies");
  assert.ok(core.moveInSection(lib, arms, -1), "a file moves up past the other");
  assert.ok(at(arms) < at(fw));
  assert.equal(core.moveInSection(lib, arms, -1), false, "not out of its group");
  core.putInSection(lib, between, "Bodies");
  assert.deepEqual(bodies().families.map((x) => x.active.id), [arms.id, fw.id, between.id]);
  assert.ok(core.moveInSection(lib, between, -1), "the other mod moves up past the whole group");
  assert.deepEqual(bodies().families.map((x) => x.active.id), [between.id, arms.id, fw.id]);
  assert.ok(core.moveGroupInSection(lib, "page:3783", -1), "the group moves up as one");
  assert.deepEqual(bodies().families.map((x) => x.active.id), [arms.id, fw.id, between.id]);
  core.placeNextTo(lib, between, arms, true);
  assert.deepEqual(bodies().families.map((x) => x.active.id), [arms.id, fw.id, between.id], "dropped on a file: below the whole group");
  core.placeNextTo(lib, fw, between, true);
  assert.equal(at(fw), at(arms) + 1, "a file does not leave its group");
  core.placeNextTo(lib, fw, arms, false);
  assert.ok(at(fw) < at(arms), "but trades places within it");
  core.placeGroupNextTo(lib, "page:3783", between, true);
  assert.deepEqual(bodies().families.map((x) => x.active.id), [between.id, fw.id, arms.id], "the group below the other mod");

  core.deleteSection(lib, "Bodies");
  delete lib.info.groupOn;
  for (const m of [fw, arms, between]) core.removeMod(lib, m);
  lib.info.order = before;
  core.saveLibrary(lib);
  console.log("page groups: ok");
}

// The page's columns: the player's choice, else the column's default; a sort shows its column.
{
  const ids = core.PageColumns.map((c) => c.id);
  assert.deepEqual(ids, ["ver", "kind", "size", "updated", "status"], "in order");
  assert.deepEqual(core.PageColumns.filter((c) => c.on).map((c) => c.id), ["ver", "kind", "size", "status"], "the columns from before the Columns button start on, Updated off");
  assert.equal(new Set(ids).size, ids.length, "ids are unique: they are kept in the player's choices");
  assert.deepEqual(core.shownColumns({}), ["ver", "kind", "size", "status"], "a player who never chose sees what they saw before");
  assert.deepEqual(core.shownColumns({}, { byDate: true }), ids, "Newest update first shows Updated while it is on");
  assert.deepEqual(core.shownColumns({ size: false, status: false }), ["ver", "kind"]);
  assert.deepEqual(core.shownColumns({ size: false }, { bySize: true }), ["ver", "kind", "size", "status"], "Largest first shows Size while it is on");
  assert.deepEqual(core.shownColumns({ updated: true, kind: false }), ["ver", "size", "updated", "status"]);
  const later = { id: "later", heading: "Later", label: "Later", on: false };
  assert.equal(core.columnShown(later, {}), false, "a new column starts off");
  assert.equal(core.columnShown(later, { later: true }), true, "until the player turns it on");
  assert.deepEqual(core.cleanChoices({ size: false, status: "no", bogus: true }), { size: false }, "only known columns, only true or false");
  assert.deepEqual(core.cleanChoices(undefined), {});
  console.log("page columns: ok");
}

// Loadouts: save the current set, change things, load it back.
{
  const file = core.saveLoadout(lib, "smoke", "2.31");
  assert.ok(fs.existsSync(file));
  const was = lib.mods.map((m) => [m.id, m.enabled]);
  lib.mods[0].enabled = !lib.mods[0].enabled;
  core.saveMod(lib, lib.mods[0]);
  const extra = core.addMod(lib, cls("bare", "Extra").placements, { name: "Extra", source: { type: "folder" } });
  const r = core.applyLoadout(lib, file);
  assert.deepEqual(lib.mods.filter((m) => m.id !== "extra").map((m) => [m.id, m.enabled]), was);
  assert.deepEqual(r.extra, ["Extra"]);
  assert.equal(lib.mods.find((m) => m.id === "extra").enabled, false);
  assert.equal(core.listLoadouts(libRoot).length, 1);
  core.removeMod(lib, extra);
  console.log("loadouts: ok");
}

// Active loadouts: Default made from the state now, changes saved into it, another one edited
// without touching the mods, switching, and export and import.
{
  const on = () => lib.mods.filter((m) => m.enabled).map((m) => m.id).sort();
  const before = on();
  delete lib.info.activeLoadout;
  assert.equal(core.activeLoadout(lib), "Default");
  assert.ok(core.findLoadout(libRoot, "Default"));
  // A change to the mods goes into the active loadout.
  const first = lib.mods.find((m) => m.enabled);
  first.enabled = false;
  core.saveMod(lib, first);
  assert.ok(core.syncActiveLoadout(lib), "wrote");
  assert.equal(core.syncActiveLoadout(lib), false, "nothing new to write");
  const def = core.readLoadout(core.findLoadout(libRoot, "Default").file);
  assert.equal(def.mods.find((e) => e.id === first.id).enabled, false);
  // A second loadout, every mod off, edited while Default stays active.
  assert.throws(() => core.newLoadout(lib, "default"), /already a loadout/);
  core.newLoadout(lib, "Testing");
  core.setInLoadout(lib, "Testing", first, { enabled: true });
  assert.equal(first.enabled, false, "the mods are not touched");
  const testing = core.readLoadout(core.findLoadout(libRoot, "Testing").file);
  assert.deepEqual(testing.mods.filter((e) => e.enabled).map((e) => e.id), [first.id]);
  // Switching: Testing's choices go on, everything else off; Default keeps its own.
  const r = core.makeActive(lib, "Testing");
  assert.equal(lib.info.activeLoadout, "Testing");
  assert.deepEqual(on(), [first.id]);
  assert.equal(r.on, 1);
  assert.throws(() => core.deleteLoadout(lib, "Testing"), /active loadout/);
  core.makeActive(lib, "Default");
  assert.deepEqual(on(), before.filter((id) => id !== first.id));
  // Rename, export, import under a free name, delete.
  core.renameLoadout(lib, "Testing", "Night city");
  assert.ok(core.findLoadout(libRoot, "Night city") && !core.findLoadout(libRoot, "Testing"));
  const out = path.join(tmp, "shared-loadout.json");
  core.exportLoadout(lib, "Night city", out);
  assert.equal(core.importLoadout(lib, out), "Night city (2)");
  core.deleteLoadout(lib, "Night city (2)");
  core.deleteLoadout(lib, "Night city");
  first.enabled = true;
  core.saveMod(lib, first);
  core.syncActiveLoadout(lib);
  assert.deepEqual(on(), before);
  console.log("active loadouts: ok");
}

// The command line over the same library.
{
  const cli = (...a) => execFileSync(process.execPath, [path.join(root, "bin", "edgedeck.mjs"), "--library", libRoot, "--game", game, ...a], { encoding: "utf8" }).trim();
  const listed = JSON.parse(cli("list", "--json"));
  assert.equal(listed.mods.length, lib.mods.length);
  assert.ok(cli("off", "bare").includes("bare: off"));
  assert.ok(cli("on", "bare").includes("bare: on"));
  assert.ok(cli("conflicts").includes("wins over"));
  assert.ok(cli("loadout", "list").includes("smoke"));
  const dep = JSON.parse(cli("deploy", "--json"));
  assert.equal(typeof dep.linked, "number");
  assert.match(cli("changes"), /no changes|missing|changed/);
  assert.ok(cli("mod", "bare").includes("CoolMod.archive"));
  const modJson = JSON.parse(cli("mod", "bare", "--json"));
  assert.equal(modJson.id, "bare");
  assert.ok(modJson.files.every((f) => typeof f.bytes === "number"));
  console.log("cli: ok");
}

// The MCP server over stdio: the same verbs as tools, through the SDK's client.
{
  const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
  const client = new Client({ name: "smoke", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, "dist", "mcp.js"), "--library", libRoot, "--game", game], stderr: "pipe" }));
  const tools = (await client.listTools()).tools;
  const names = tools.map((t) => t.name).sort();
  for (const n of ["edgedeck_add", "edgedeck_changes", "edgedeck_conflicts", "edgedeck_deploy", "edgedeck_list", "edgedeck_loadout", "edgedeck_mod", "edgedeck_move", "edgedeck_pending", "edgedeck_remove", "edgedeck_turn", "edgedeck_undo", "edgedeck_vortex"]) assert.ok(names.includes(n), `tool ${n} missing from ${names.join(", ")}`);
  // Claude Code asks the player before these, in every permission mode; no other tool asks.
  const asking = tools.filter((t) => t._meta?.["anthropic/requiresUserInteraction"] === true).map((t) => t.name).sort();
  assert.deepEqual(asking, ["edgedeck_deploy", "edgedeck_remove", "edgedeck_undo"]);
  const text = (r) => r.content.map((c) => c.text).join("");
  const listed = await client.callTool({ name: "edgedeck_list", arguments: {} });
  assert.ok(!listed.isError && text(listed).includes("bare"), text(listed));
  const off = await client.callTool({ name: "edgedeck_turn", arguments: { id: "bare", on: false } });
  assert.ok(text(off).includes("bare: off"));
  assert.equal(core.loadLibrary(libRoot, game).mods.find((m) => m.id === "bare").enabled, false, "the change reached the library files");
  await client.callTool({ name: "edgedeck_turn", arguments: { id: "bare", on: true } });
  const pending = await client.callTool({ name: "edgedeck_pending", arguments: {} });
  assert.ok(!pending.isError);
  const bad = await client.callTool({ name: "edgedeck_mod", arguments: { id: "no-such-mod" } });
  assert.ok(bad.isError && text(bad).includes("no mod with id"));
  await client.close();
  console.log(`mcp: ok (${names.length} tools)`);
}

// Turn a mod off: its files leave on the next deploy.
rooted.enabled = false;
core.saveMod(lib, rooted);
r2 = core.deploy(lib, game);
assert.equal(r2.removed, 4);
assert.ok(!fs.existsSync(path.join(game, "archive", "pc", "mod", "Rooted.archive")));
assert.ok(!fs.existsSync(path.join(game, "r6", "tweaks", "Rooted")), "folder EDGEdeck created is gone");
console.log("off: ok");

// A foreign file in the way is backed up and restored on undo.
rooted.enabled = true;
core.saveMod(lib, rooted);
fs.writeFileSync(path.join(game, "archive", "pc", "mod", "Rooted.archive"), "user's own archive");
r2 = core.deploy(lib, game);
assert.equal(r2.backedUp, 1);
const u = core.undo(lib, game);
assert.equal(u.skipped.length, 0);
assert.equal(fs.readFileSync(path.join(game, "archive", "pc", "mod", "Rooted.archive"), "utf8"), "user's own archive", "backup restored");
assert.ok(!fs.existsSync(path.join(game, core.ManifestName)));
assert.ok(!fs.existsSync(path.join(game, "archive", "pc", "mod", "modlist.txt")));
assert.ok(fs.existsSync(path.join(game, "r6", "scripts", "UserOwn.reds")), "never touched the user's file");
assert.ok(fs.existsSync(path.join(game, "r6", "scripts")), "pre-existing folder kept");
console.log("undo: ok");

// Archive conflicts: pure intersection of listings, winners first.
{
  const L = (mod, archive, entries) => ({ mod, archive, resources: new Map(entries) });
  const summary = core.findArchiveConflicts([
    L("a", "archive/pc/mod/A.archive", [["1", "base/x.mesh"], ["2", "base/y.mesh"]]),
    L("b", "archive/pc/mod/B.archive", [["2", "base/y.mesh"], ["3", "base/z.mesh"]]),
    L("c", "archive/pc/mod/C.archive", [["2", "base/y.mesh"]]),
  ]);
  assert.equal(summary.conflicts.length, 1);
  assert.deepEqual(summary.conflicts[0].mods, ["a", "b", "c"]);
  assert.equal(summary.won.get("a"), 2);
  assert.equal(summary.lost.get("b"), 1);
  assert.equal(summary.lost.get("c"), 1);
  assert.equal(summary.pairs.get("a|b"), 1);
  console.log("conflicts: ok");
}

// REDmod packages: the mod list in order, no tool run here.
{
  const redmod = core.addMod(lib, cls("redmod", "MyRedmod").placements, { name: "MyRedmod", source: { type: "folder" } });
  assert.deepEqual(core.enabledRedmodPackages(lib), ["MyRedmod"]);
  core.removeMod(lib, redmod);
  console.log("redmod: ok");
}

// Finding the game: through Steam's library list, GOG or Epic.
{
  const libs = core.steamLibraries();
  const found = core.findGame();
  assert.ok(Array.isArray(libs));
  if (found) assert.ok(core.isGameFolder(found));
  console.log(`find game: ok (${libs.length} Steam librar${libs.length === 1 ? "y" : "ies"}, game ${found ?? "not found"})`);
  const steamGame = "D:\\SteamLibrary\\steamapps\\common\\Cyberpunk 2077";
  const gogGame = "D:\\GOG Games\\Cyberpunk 2077";
  assert.deepEqual(core.launchTarget(steamGame, "auto"), { kind: "steam", url: "steam://run/1091500//-modded/" });
  assert.deepEqual(core.launchTarget(gogGame, "auto"), { kind: "exe", exe: path.join(gogGame, "bin", "x64", "Cyberpunk2077.exe"), args: ["-modded"] });
  assert.equal(core.launchTarget(steamGame, "exe").kind, "exe");
  assert.equal(core.launchTarget(gogGame, "steam").kind, "steam");
  const env = core.playerEnv({ ELECTRON_RUN_AS_NODE: "1", Path: "C:\Windows" });
  assert.deepEqual(env, { Path: "C:\Windows" }, "the game does not inherit ELECTRON_RUN_AS_NODE (EDGEdeck #12)");
  console.log("run game target: ok");
}

// Game version from the real install, if it is here.
{
  const real = "C:/Program Files (x86)/Steam/steamapps/common/Cyberpunk 2077";
  const v = await core.gameVersion(real);
  console.log(`game version: ${v ?? "no game here"}`);
}

// REDbridge, if a build is next to this checkout: open a mod archive and list what is inside.
{
  const exe = core.findBridge("", root);
  if (exe) {
    const b = new core.BridgeClient(exe);
    console.log(`bridge dotnet root: ${b.dotnetRoot ?? "(machine-wide)"}`);
    b.start();
    const info = await b.info();
    console.log(`bridge ${info.version} (WolvenKit ${info.wolvenKit}), game loaded: ${info.gameLoaded}`);
    assert.ok(core.compareVersions(info.version, core.MinBridgeVersion) >= 0, `bridge ${info.version} < ${core.MinBridgeVersion}`);
    const staging = core.vortexStagingPath();
    let sample;
    const findArchive = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { const r = findArchive(p); if (r) return r; }
        else if (e.name.toLowerCase().endsWith(".archive")) return p;
      }
    };
    if (fs.existsSync(staging)) sample = findArchive(staging);
    // Else the smallest mod archive in the game folder (only copied, never changed).
    const gameMods = core.findGame() ? path.join(core.findGame(), "archive", "pc", "mod") : "";
    if (!sample && gameMods && fs.existsSync(gameMods)) {
      sample = fs.readdirSync(gameMods).filter((f) => f.toLowerCase().endsWith(".archive")).map((f) => path.join(gameMods, f)).sort((x, y) => fs.statSync(x).size - fs.statSync(y).size)[0];
    }
    if (sample) {
      // A copy, so the staging folder is only read: deploy replaces such files once the bridge has let go (EDGEdeck #10).
      const copy = path.join(fs.mkdtempSync(path.join(tmp, "bridge-")), path.basename(sample));
      fs.copyFileSync(sample, copy);
      const r = await b.openMod(copy);
      assert.ok(r.files > 0);
      console.log(`bridge openMod ${path.basename(sample)}: ${r.files} resources, first ${r.items[0].name}`);
      let held = false;
      try {
        fs.renameSync(copy, copy + ".moved");
        fs.renameSync(copy + ".moved", copy);
      } catch {
        held = true;
      }
      await b.stop();
      assert.ok(!b.running);
      fs.renameSync(copy, copy + ".moved");
      fs.rmSync(copy + ".moved");
      console.log(`bridge stop: ok (the bridge ${held ? "held the archive until it stopped" : "did not hold the archive"})`);
    } else {
      console.log("bridge openMod: no sample archive found, skipped");
      await b.stop();
    }
  } else {
    console.log("bridge: not found, skipped");
  }
}

// REDbridge releases: the latest on GitHub has a Windows zip; a .NET 10 runtime is found or not.
{
  assert.equal(typeof core.dotnet10Root(), core.dotnet10Root() ? "string" : "undefined");
  assert.equal(core.installedBridge(path.join(libRoot, "nowhere")), undefined);
  try {
    const rel = await core.latestBridgeRelease();
    assert.match(rel.assetName, /win-x64\.zip$/);
    assert.ok(rel.size > 1000000);
    console.log(`bridge release: ok (${rel.tag}, ${Math.round(rel.size / 1048576)} MB, .NET 10 at ${core.dotnet10Root() ?? "none"})`);
  } catch (err) {
    console.log(`bridge release: skipped (${err.message})`);
  }
}

// Nexus sign-in against a fake Nexus socket: token, authorise page, a dropped connection, the key.
{
  const sockets = [];
  const fakeSocket = () => {
    const listeners = {};
    const s = {
      sent: [],
      closed: false,
      addEventListener: (t, f) => (listeners[t] ??= []).push(f),
      emit: (t, ev) => (listeners[t] ?? []).forEach((f) => f(ev)),
      send: (d) => s.sent.push(JSON.parse(d)),
      close: () => (s.closed = true),
    };
    sockets.push(s);
    return s;
  };
  const opened = [];
  const pending = core.signIn({ application: "edgedeck-test", open: (u) => opened.push(u), connect: fakeSocket, timeoutMs: 5000 });
  const tick = () => new Promise((r) => setTimeout(r, 5));
  sockets[0].emit("open");
  assert.deepEqual(sockets[0].sent[0], { id: sockets[0].sent[0].id, token: null, protocol: 2 });
  assert.match(sockets[0].sent[0].id, /^[0-9a-f-]{36}$/);
  sockets[0].emit("message", { data: JSON.stringify({ success: true, data: { connection_token: "tok" }, error: null }) });
  await tick();
  assert.equal(opened.length, 1);
  assert.ok(opened[0].includes(`sso?id=${sockets[0].sent[0].id}&application=edgedeck-test`));
  sockets[0].emit("close");
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(sockets.length, 2, "reconnects after a drop");
  sockets[1].emit("open");
  assert.deepEqual(sockets[1].sent[0], { id: sockets[0].sent[0].id, token: "tok", protocol: 2 });
  sockets[1].emit("message", { data: JSON.stringify({ success: true, data: { api_key: "KEY123" }, error: null }) });
  assert.equal(await pending, "KEY123");
  assert.equal(opened.length, 1, "authorise page opened once");
  assert.ok(sockets[1].closed);
  // Refused.
  const s2 = [];
  const refused = core.signIn({ application: "x", open: () => undefined, connect: () => { const s = fakeSocket(); s2.push(s); return s; }, timeoutMs: 5000 });
  s2[0].emit("open");
  s2[0].emit("message", { data: JSON.stringify({ success: false, data: null, error: "Invalid application" }) });
  await assert.rejects(refused, /Invalid application/);
  // Cancelled.
  const ac = new AbortController();
  const cancelled = core.signIn({ application: "x", open: () => undefined, connect: fakeSocket, signal: ac.signal, timeoutMs: 5000 });
  ac.abort();
  await assert.rejects(cancelled, /cancelled/);
  assert.equal(typeof core.hasWebSocket(), "boolean");
  console.log("nexus sign-in: ok");
}

// Nexus OAuth sign-in against a fake Nexus: PKCE, the loopback redirect, the code exchange, a
// refresh, the user out of the token, and a Bearer call to the REST API renewed once on 401.
{
  const http = await import("node:http");
  const crypto = await import("node:crypto");
  const jwt = (name, roles) => ["eyJhbGciOiJub25lIn0", Buffer.from(JSON.stringify({ user: { id: 42, username: name, membership_roles: roles } })).toString("base64url"), "sig"].join(".");
  const tokenCalls = [];
  const apiCalls = [];
  let spentR1 = false;
  const fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const u = new URL(req.url, "http://x");
      const json = (status, obj) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(obj));
      if (req.method === "POST" && u.pathname === "/oauth/token") {
        const form = Object.fromEntries(new URLSearchParams(body));
        tokenCalls.push(form);
        if (form.grant_type === "authorization_code") {
          if (form.code !== "CODE1" || !form.code_verifier || form.client_id !== "edgedeck_test") return json(400, { error: "invalid_grant", error_description: "bad code" });
          return json(200, { access_token: jwt("alice", ["premium"]), token_type: "Bearer", expires_in: 3600, refresh_token: "R1", scope: "openid" });
        }
        if (form.grant_type === "refresh_token") {
          if (form.refresh_token !== "R1" || spentR1) return json(400, { error: "invalid_grant" });
          spentR1 = true;
          return json(200, { access_token: jwt("alice", ["premium"]), token_type: "Bearer", expires_in: 3600, refresh_token: "R2", scope: "openid" });
        }
        return json(400, { error: "unsupported_grant_type" });
      }
      if (u.pathname === "/v1/users/validate.json") {
        apiCalls.push(req.headers.authorization);
        if (req.headers.authorization !== "Bearer T-new") return json(401, { message: "Please provide a valid token" });
        return json(200, { user_id: 42, name: "alice", is_premium: true, is_supporter: false });
      }
      res.writeHead(404).end();
    });
  });
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${fake.address().port}`;
  const opened = [];
  const pending = core.signInWithOAuth({ clientId: "edgedeck_test", base: `${base}/oauth`, open: (u) => opened.push(u), timeoutMs: 5000 });
  while (!opened.length) await new Promise((r) => setTimeout(r, 5));
  const auth = new URL(opened[0]);
  const q = auth.searchParams;
  assert.equal(auth.origin + auth.pathname, `${base}/oauth/authorize`);
  assert.equal(q.get("response_type"), "code");
  assert.equal(q.get("client_id"), "edgedeck_test");
  assert.equal(q.get("code_challenge_method"), "S256");
  assert.equal(q.get("scope"), "openid profile email");
  assert.match(q.get("redirect_uri"), /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(q.get("state"), /^[0-9a-f-]{36}$/);
  // A redirect with the wrong state is ignored; the sign-in keeps waiting.
  const bad = await fetch(`${q.get("redirect_uri")}/?code=CODE1&state=nope`);
  assert.equal(bad.status, 400);
  // The browser comes back with the code.
  const ok = await fetch(`${q.get("redirect_uri")}/?code=CODE1&state=${q.get("state")}`);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /Signed in/);
  const tokens = await pending;
  assert.equal(tokens.refreshToken, "R1");
  assert.ok(tokens.expiresAt > Date.now() + 3500_000);
  const ex = tokenCalls[0];
  assert.equal(ex.redirect_uri, q.get("redirect_uri"));
  assert.equal(crypto.createHash("sha256").update(ex.code_verifier).digest("base64url"), q.get("code_challenge"), "the verifier matches the challenge");
  assert.deepEqual(core.tokenUser(tokens.accessToken), { id: 42, name: "alice", premium: true, supporter: false });
  assert.equal(core.tokenUser("not-a-jwt"), undefined);
  // Nexus refuses.
  const opened2 = [];
  const refused = core.signInWithOAuth({ clientId: "edgedeck_test", base: `${base}/oauth`, open: (u) => opened2.push(u), timeoutMs: 5000 });
  while (!opened2.length) await new Promise((r) => setTimeout(r, 5));
  const q2 = new URL(opened2[0]).searchParams;
  const refusedCheck = assert.rejects(refused, /The user said no/);
  await fetch(`${q2.get("redirect_uri")}/?error=access_denied&error_description=The+user+said+no&state=${q2.get("state")}`);
  await refusedCheck;
  // Cancelled: the port is released.
  const ac = new AbortController();
  const opened3 = [];
  const cancelled = core.signInWithOAuth({ clientId: "edgedeck_test", base: `${base}/oauth`, open: (u) => opened3.push(u), signal: ac.signal, timeoutMs: 5000 });
  while (!opened3.length) await new Promise((r) => setTimeout(r, 5));
  const cancelledCheck = assert.rejects(cancelled, /cancelled/);
  ac.abort();
  await cancelledCheck;
  await assert.rejects(fetch(new URL(opened3[0]).searchParams.get("redirect_uri")), "the listener is gone");
  // Refresh, and when a refresh is due.
  const t2 = await core.refreshTokens({ clientId: "edgedeck_test", refreshToken: "R1", base: `${base}/oauth` });
  assert.equal(t2.refreshToken, "R2");
  await assert.rejects(core.refreshTokens({ clientId: "edgedeck_test", refreshToken: "R1", base: `${base}/oauth` }), /invalid_grant/);
  assert.equal(core.needsRefresh({ ...t2, expiresAt: Date.now() + 30_000 }), true);
  assert.equal(core.needsRefresh(t2), false);
  // The REST client with a token: Bearer header, one renewal on 401.
  let renewed = 0;
  const client = new core.NexusClient({ bearer: "T-old" }, "0.0.0", { api: `${base}/v1`, refresh: async () => (renewed++, "T-new") });
  assert.equal(client.usesToken, true);
  const user = await client.validate();
  assert.equal(user.name, "alice");
  assert.equal(renewed, 1);
  assert.deepEqual(apiCalls, ["Bearer T-old", "Bearer T-new"]);
  const dead = new core.NexusClient({ bearer: "T-dead" }, "0.0.0", { api: `${base}/v1`, refresh: async () => undefined });
  await assert.rejects(dead.validate(), /sign in again/);
  assert.equal(new core.NexusClient("KEY", "0.0.0").usesToken, false);
  fake.close();
  console.log("nexus oauth: ok");
}

// Nexus: pure parts only; no network.
{
  const nxm = core.parseNxm("nxm://cyberpunk2077/mods/7780/files/144164?key=abc123&expires=1760000000&user_id=42");
  assert.deepEqual(nxm, { game: "cyberpunk2077", modId: 7780, fileId: 144164, key: "abc123", expires: 1760000000, userId: 42 });
  // The link back out of the vscode:// query, decoded (as VS Code hands it over) or not: all its parameters.
  {
    const link = "nxm://cyberpunk2077/mods/35393/files/166705?key=a-b_c&expires=1760000000&user_id=42";
    assert.equal(core.nxmFromQuery(`url=${link}`), link);
    assert.equal(core.nxmFromQuery(`url=${encodeURIComponent(link)}`), link);
    assert.equal(core.nxmFromQuery("other=1"), undefined);
  }
  assert.throws(() => core.parseNxm("https://www.nexusmods.com/cyberpunk2077/mods/7780"), /Not an nxm link/);
  assert.throws(() => core.parseNxm("nxm://cyberpunk2077/collections/abc/revisions/1"), /collections/);
  assert.equal(core.versionNewer("1.20.4", "1.20.3"), true);
  assert.equal(core.versionNewer("1.20.3", "1.20.3"), false);
  assert.equal(core.versionNewer("1.9", "1.10"), false);
  assert.equal(core.versionNewer("2.0", ""), false);
  {
    // Downloads: the speed over the last seconds, the notification's line, one file at a time.
    let t = 0;
    const meter = new core.SpeedMeter(5000, () => t);
    meter.add(0);
    assert.equal(meter.bytesPerSecond, 0);
    for (t = 1000; t <= 10000; t += 1000) meter.add(t * 2048);
    assert.equal(Math.round(meter.bytesPerSecond), 2048 * 1000);
    assert.equal(core.progressText(12 * 1048576, 70 * 1048576, 1.4 * 1048576), "12 of 70 MB · 1.4 MB/s · 42 s left");
    assert.equal(core.progressText(512 * 1024, 4 * 1048576, 0), "0.5 of 4.0 MB");
    assert.equal(core.progressText(1048576, 600 * 1048576, 300 * 1024), "1.0 of 600 MB · 300 KB/s · 34 min 05 s left");
    let limit = 1;
    const q = new core.DownloadQueue(() => limit);
    const order = [];
    const waits = [];
    let release;
    const first = q.run(() => new Promise((r) => { order.push("a"); release = r; }));
    const second = q.run(async () => { order.push("b"); }, (ahead) => waits.push(`b${ahead}`));
    const third = q.run(async () => { order.push("c"); }, (ahead) => waits.push(`c${ahead}`));
    await Promise.resolve();
    assert.deepEqual(order, ["a"]);
    assert.equal(q.queued, 2);
    release();
    await Promise.all([first, second, third]);
    assert.deepEqual(order, ["a", "b", "c"]);
    assert.deepEqual(waits.slice(0, 2), ["b1", "c2"]);
    assert.ok(waits.includes("c1"));
    limit = 0;
    const many = [];
    const all = [1, 2, 3].map((n) => q.run(() => new Promise((r) => { many.push(n); setTimeout(r, 5); })));
    await Promise.resolve();
    assert.deepEqual(many, [1, 2, 3]);
    await Promise.all(all);
    await assert.rejects(q.run(async () => { throw new Error("boom"); }), /boom/);
    limit = 1;
    assert.equal(await q.run(async () => 7), 7);
    assert.equal(core.downloadsAtOnce(false), 1, "a free account: one at a time");
    assert.equal(core.downloadsAtOnce(undefined), 1, "not known yet counts as free");
    assert.equal(core.downloadsAtOnce(true), 0, "Premium: no limit");
  }
  const newest = core.newestFile({ files: [
    { file_id: 1, name: "old", version: "1.0", category_name: "OLD_VERSION", is_primary: false, uploaded_timestamp: 1 },
    { file_id: 2, name: "main", version: "1.1", category_name: "MAIN", is_primary: true, uploaded_timestamp: 2 },
    { file_id: 3, name: "opt", version: "1.2", category_name: "OPTIONAL", is_primary: false, uploaded_timestamp: 3 },
  ], file_updates: [] });
  assert.equal(newest.file_id, 2);
  assert.equal(core.modPageUrl(7780), "https://www.nexusmods.com/cyberpunk2077/mods/7780");
  assert.match(core.forwarderCommand(), /vscode:\/\/edgemodders\.edgedeck\/nxm\?url=/);
  // The forwarder as Windows runs it (the registry's command line, %1 replaced): a real link has &
  // between its parameters, which PowerShell code cannot hold bare. Without an exe, printing the
  // link instead of opening it; with one (the editor's own exe, so whatever holds the vscode://
  // protocol does not matter), a stand-in exe in a folder with a quote and a space, which writes
  // down what it was given.
  {
    const link = "nxm://cyberpunk2077/mods/107/files/1234?key=a-b_c&expires=1760000000&user_id=42";
    const runLine = (line) => spawnSync("powershell.exe", [line.replace("%1", link).slice("powershell.exe ".length)], { windowsVerbatimArguments: true, encoding: "utf8" });
    const out = runLine(core.forwarderCommand().replace("Start-Process $u", "Write-Output $u"));
    assert.equal(out.stdout.trim(), `vscode://edgemodders.edgedeck/nxm?url=${encodeURIComponent(link)}`, out.stderr);
    const dir = path.join(tmp, "V's editor");
    fs.mkdirSync(dir, { recursive: true });
    const exe = path.join(dir, "Code.cmd");
    const got = path.join(dir, "got.txt");
    fs.writeFileSync(exe, `@echo %*>"${got}"\r\n`);
    const res = runLine(core.forwarderCommand({ exe, scheme: "vscode-insiders" }).replace("-ArgumentList", "-Wait -ArgumentList"));
    assert.equal(res.status, 0, res.stderr);
    assert.equal(fs.readFileSync(got, "utf8").trim(), `--open-url -- vscode-insiders://edgemodders.edgedeck/nxm?url=${encodeURIComponent(link)}`);
  }
  assert.equal(core.describeHandler(core.forwarderCommand()), "EDGEdeck");
  assert.equal(core.describeHandler(core.forwarderCommand({ exe: "C:\\Code\\Code.exe", scheme: "vscode" })), "EDGEdeck");
  // The exe read back out of a forwarder, so EDGEdeck in one editor leaves another editor's alone.
  assert.equal(core.forwarderExe(core.forwarderCommand({ exe: "C:\\V's Code\\Code.exe" })), "C:\\V's Code\\Code.exe");
  assert.equal(core.forwarderExe(core.forwarderCommand()), undefined);
  assert.equal(core.describeHandler('"C:\\Vortex\\Vortex.exe" -d "%1"'), "Vortex");
  const handler = await core.currentNxmHandler();
  console.log(`nexus: ok (nxm links on this machine: ${core.describeHandler(handler)})`);
}

// Add to project: loose files land under source/resources at their deploy paths; archives are reported.
{
  const proj = path.join(tmp, "proj");
  fs.mkdirSync(proj, { recursive: true });
  const projectFile = path.join(proj, "MyMod.cpmodproj");
  fs.writeFileSync(projectFile, "<CP77Mod><ModName>MyMod</ModName></CP77Mod>");
  const r = core.addToProject(lib, rooted, rooted.files, projectFile);
  assert.ok(r.archives.some((f) => f.endsWith("Rooted.archive")), "the archive is reported, not copied");
  assert.ok(r.copied.length >= 1, "loose files copied");
  for (const rel of r.copied) assert.ok(fs.existsSync(path.join(proj, rel)), rel);
  assert.ok(r.copied.every((rel) => rel.startsWith(path.join("source", "resources"))));
  const again = core.addToProject(lib, rooted, rooted.files, projectFile);
  assert.equal(again.copied.length, 0);
  assert.equal(again.same.length, r.copied.length);
  const changed = path.join(proj, r.copied[0]);
  fs.writeFileSync(changed, "edited in the project");
  const kept = core.addToProject(lib, rooted, rooted.files, projectFile);
  assert.deepEqual(kept.kept, [r.copied[0]]);
  assert.equal(fs.readFileSync(changed, "utf8"), "edited in the project");
  const deployPath = r.copied[0].split(path.sep).slice(2).join("/");
  const replaced = core.addToProject(lib, rooted, [deployPath], projectFile, new Set([deployPath]));
  assert.deepEqual(replaced.copied, [r.copied[0]]);
  console.log(`add to project: ok (${r.copied.length} files, ${r.archives.length} archives skipped)`);
}

// Frameworks: the game version against the one at the last deploy, and updates from Nexus.
{
  const fwLib = { root: path.join(tmp, "fw"), info: { version: 1, gamePath: game }, mods: [
    { id: "red4ext", name: "RED4ext", version: "1.26.0", enabled: true, kinds: ["framework"], files: ["bin/x64/winmm.dll"], added: "2026-10-01T00:00:00Z", source: { type: "nexus", modId: 2380 }, nexus: { name: "RED4ext", version: "1.27.0", latestVersion: "1.27.0", latestFileId: 1, latestFileName: "x", checked: "2026-10-12T00:00:00Z" } },
    { id: "cet", name: "Cyber Engine Tweaks", version: "1.35.0", enabled: true, kinds: ["framework"], files: ["bin/x64/plugins/cyber_engine_tweaks.asi"], added: "2026-10-01T00:00:00Z", source: { type: "file" } },
    { id: "coolmod", name: "CoolMod", version: "1.0", enabled: true, kinds: ["archive"], files: ["archive/pc/mod/CoolMod.archive"], added: "2026-10-01T00:00:00Z", source: { type: "file" } },
  ] };
  const same = core.checkFrameworks(fwLib, "2.3", { gameVersion: "2.3" });
  assert.equal(same.changed, false);
  assert.equal(same.frameworks.length, 2);
  assert.equal(same.updates.length, 1);
  assert.deepEqual(same.unchecked.map((m) => m.id), ["cet"]);
  assert.equal(core.frameworkSummary(same), "game 2.3 · 1 update");
  const changed = core.checkFrameworks(fwLib, "2.31", { gameVersion: "2.3" });
  assert.equal(changed.changed, true);
  assert.equal(core.frameworkSummary(changed), "game updated to 2.31 · 1 update");
  assert.match(core.frameworkDetail(changed)[0], /was 2.3 at the last deploy/);
  assert.match(core.frameworkDetail(changed).at(-1), /Cyber Engine Tweaks/);
  const first = core.checkFrameworks(fwLib, "2.31", undefined);
  assert.equal(first.changed, false);
  assert.equal(core.frameworkSummary(core.checkFrameworks(fwLib, undefined, undefined)), "");
  core.deploy(lib, game, new Map(), undefined, "2.3");
  assert.equal(core.readManifest(game).gameVersion, "2.3");
  core.undo(lib, game);
  console.log("frameworks: ok");
}

// Get the frameworks: which of the six the library has (by Nexus id, or by a file only that framework
// has), and which GitHub release asset is taken, against a fake GitHub with the real asset names.
{
  const fl = core.loadLibrary(path.join(tmp, "fw-lib"), game);
  const placed = (to) => {
    const from = path.join(tmp, "fw-src", to);
    write(from, "x");
    return [{ from, to }];
  };
  // Codeware from Vortex (Nexus id, older), ArchiveXL added by hand (no id, current), the rest missing.
  core.addMod(fl, placed("red4ext/plugins/Codeware/Codeware.dll"), { name: "Codeware", version: "1.20.5", source: { type: "vortex", modId: 7780 } });
  core.addMod(fl, placed("red4ext/plugins/ArchiveXL/ArchiveXL.dll"), { name: "ArchiveXL", version: "1.27.5", source: { type: "folder" } });
  assert.deepEqual(core.missingFrameworks(fl).map((f) => f.name), ["RED4ext", "Cyber Engine Tweaks", "redscript", "TweakXL"]);
  const releases = {
    "WopsS/RED4ext": ["v1.30.0", ["red4ext-1.30.0.zip", "red4ext-symbols-1.30.0.zip"]],
    "maximegmd/CyberEngineTweaks": ["v1.38.0", ["cet_1_38_0.zip"]],
    "jac3km4/redscript": ["v0.5.32", ["redscript-cli-aarch64-darwin", "redscript-cli.exe", "redscript-v0.5.32-macos.zip", "redscript-v0.5.32-windows.zip"]],
    "psiberx/cp2077-archive-xl": ["v1.27.5", ["ArchiveXL-1.27.5-pdb.zip", "ArchiveXL-1.27.5.zip"]],
    "psiberx/cp2077-tweak-xl": ["v1.11.5", ["TweakXL-1.11.5-pdb.zip", "TweakXL-1.11.5.zip"]],
    "psiberx/cp2077-codeware": ["v1.20.6", ["Codeware-1.20.6-pdb.zip", "Codeware-1.20.6.zip"]],
  };
  let asked = 0;
  const fakeGitHub = async (url) => {
    asked++;
    const repo = /\/repos\/(.+)\/releases\/latest$/.exec(url)[1];
    if (repo === "jac3km4/redscript" && asked > 6) return { ok: false, status: 403, json: async () => ({}) };
    const [tag, assets] = releases[repo];
    return { ok: true, status: 200, json: async () => ({ tag_name: tag, html_url: `https://github.com/${repo}/releases/tag/${tag}`, assets: assets.map((name) => ({ name, browser_download_url: `https://github.com/${repo}/releases/download/${tag}/${name}`, size: 1 })) }) };
  };
  const states = await core.frameworkStates(fl, fakeGitHub, "https://api.example");
  const by = Object.fromEntries(states.map((s) => [s.source.name, s]));
  assert.deepEqual(states.map((s) => s.release?.assetName), ["red4ext-1.30.0.zip", "cet_1_38_0.zip", "redscript-v0.5.32-windows.zip", "ArchiveXL-1.27.5.zip", "TweakXL-1.11.5.zip", "Codeware-1.20.6.zip"], "the zip to install, not symbols or other platforms");
  assert.equal(by["Cyber Engine Tweaks"].release.version, "1.38.0");
  assert.equal(by["RED4ext"].wanted, true, "missing");
  assert.equal(by["Codeware"].wanted, true, "1.20.6 is newer than the library's 1.20.5");
  assert.equal(by["Codeware"].family.nexusId, 7780);
  assert.equal(by["ArchiveXL"].wanted, false, "current, and known by its file without a Nexus id");
  assert.ok(by["ArchiveXL"].family.key.startsWith("name:"), "the hand-added ArchiveXL keeps its own family key; Get passes it on");
  // GitHub's limit without an account: said in words, and a missing framework is still wanted.
  const limited = await core.frameworkStates(fl, fakeGitHub, "https://api.example");
  const rs = limited.find((s) => s.source.name === "redscript");
  assert.ok(!rs.release && /limit/.test(rs.error) && rs.wanted);
  console.log("get the frameworks: ok");
}

// Vortex's staging folder found where the user named it, or where Vortex's manifest says, or not at all.
{
  const fakeGame = path.join(tmp, "vortex-game");
  const staging = path.join(tmp, "Vortex Mods", "cyberpunk2077");
  fs.mkdirSync(path.join(staging, "Codeware-7780-1-20-5-1777845006", "red4ext", "plugins", "Codeware"), { recursive: true });
  fs.writeFileSync(path.join(staging, "Codeware-7780-1-20-5-1777845006", "red4ext", "plugins", "Codeware", "Codeware.dll"), "x");
  fs.mkdirSync(fakeGame, { recursive: true });
  const named = core.listVortexMods(fakeGame, staging);
  assert.equal(named.length, 1);
  assert.equal(named[0].name, "Codeware");
  assert.equal(named[0].modId, 7780);
  assert.ok(core.vortexStagingCandidates(fakeGame, staging)[0] === staging, "the user's folder is tried first");
  fs.writeFileSync(path.join(fakeGame, "vortex.deployment.json"), JSON.stringify({ stagingPath: staging, files: [{ source: "Codeware-7780-1-20-5-1777845006" }] }));
  assert.equal(core.findVortexStaging(fakeGame), staging, "the manifest's stagingPath is found without a setting");
  assert.equal(core.listVortexMods(fakeGame)[0].deployed, true);
  assert.equal(core.findVortexStaging(fakeGame, path.join(tmp, "nowhere")), staging, "a wrong setting falls through to the others");
  assert.ok(core.vortexStagingCandidates(fakeGame).some((p) => /Vortex Mods[\\/]cyberpunk2077$/.test(p)), "Vortex's other-drive suggestion is searched");
  // A mod known by another name than its download (Cyber Engine Tweaks ships as "CET ... - Scripting fixes").
  assert.equal(core.vortexDisplayName({ name: "CET 1.37.1 - Scripting fixes", modId: 107 }), "Cyber Engine Tweaks");
  assert.equal(core.vortexDisplayName({ name: "Flavorful", modId: 13575 }), "Flavorful", "unknown ids keep their own name");
  // Both ways Vortex names its folders, with versions that hold letters (real names from a staging folder).
  const parsed = (f) => core.parseVortexFolder(f);
  assert.deepEqual(parsed("Codeware-7780-1-20-5-1777845006"), { name: "Codeware", modId: 7780, version: "1.20.5" });
  assert.deepEqual(parsed("Preem Scanner - No Line Effect Removal-9215-1-0-1a-1695485728"), { name: "Preem Scanner - No Line Effect Removal", modId: 9215, version: "1.0.1a" }, "a letter in an older folder's version");
  assert.deepEqual(parsed("Eviction Notice-23187-1-0-3-for-2-3-1755569719"), { name: "Eviction Notice", modId: 23187, version: "1.0.3.for.2.3" }, "the id is the first number after the name, not the last");
  assert.deepEqual(parsed("Flushing Etiquette 27902 3.3.2 2026-11-07T18-59Z D2ZS2n36j"), { name: "Flushing Etiquette", modId: 27902, version: "3.3.2" }, "a newer Vortex's folder");
  assert.deepEqual(parsed("DroneEngineer 1.1.0 37244 5 2026-11-07T14-27Z 2w0lw1dVD"), { name: "DroneEngineer 1.1.0", modId: 37244, version: "5" }, "a version in the name stays in the name");
  assert.deepEqual(parsed("vibinFM 99718 1.6-beta 2026-10-02T11-04Z abcDEF123"), { name: "vibinFM", modId: 99718, version: "1.6-beta" });
  assert.equal(parsed("VBody_MiV2_0"), undefined, "a folder named by hand");
  fs.mkdirSync(path.join(staging, "Flushing Etiquette 27902 3.3.2 2026-11-07T18-59Z D2ZS2n36j", "archive", "pc", "mod"), { recursive: true });
  fs.writeFileSync(path.join(staging, "Flushing Etiquette 27902 3.3.2 2026-11-07T18-59Z D2ZS2n36j", "archive", "pc", "mod", "flushing.archive"), "x");
  const newer = core.listVortexMods(fakeGame, staging).find((m) => m.modId === 27902);
  assert.ok(newer && newer.name === "Flushing Etiquette" && newer.version === "3.3.2", "a newer Vortex's mod keeps its Nexus id at import");
  console.log("vortex staging: ok");
}

// Move library: a rename on the same drive, a checked copy across drives, and the next deploy switches
// the game's files between hardlinks and copies to match.
{
  const moveGame = path.join(tmp, "move-game");
  fs.mkdirSync(path.join(moveGame, "bin", "x64"), { recursive: true });
  fs.writeFileSync(path.join(moveGame, "bin", "x64", "Cyberpunk2077.exe"), "not really");
  const libA = path.join(tmp, "move-lib-a");
  let ml = core.loadLibrary(libA, moveGame);
  const mm = core.addMod(ml, cls("bare", "Bare").placements, { name: "Bare", source: { type: "folder" } });
  core.deploy(ml, moveGame, new Map());
  const deployed = () => core.readManifest(moveGame).files.filter((e) => e.mod === mm.id);
  assert.ok(deployed().length && deployed().every((e) => e.ino), "deployed as hardlinks on the same drive");
  const gameFile = path.join(moveGame, "archive", "pc", "mod", "CoolMod.archive");
  const inode = (f) => fs.statSync(f, { bigint: true }).ino;

  // Errors first: into itself, into a non-empty folder.
  await assert.rejects(core.moveLibrary(libA, path.join(libA, "sub")), /inside the library/);
  const busy = path.join(tmp, "busy");
  write(path.join(busy, "x.txt"), "x");
  await assert.rejects(core.moveLibrary(libA, busy), /not empty/);
  assert.equal(core.moveTarget(busy), path.join(busy, "EDGEdeck"), "a non-empty folder gets an EDGEdeck folder in it");
  assert.ok(core.holdsLibrary(libA));

  // The same drive: a rename, the hardlinks stay, nothing to deploy.
  const libB = path.join(tmp, "move-lib-b");
  let moved = await core.moveLibrary(libA, libB);
  assert.equal(moved.how, "rename");
  assert.ok(!fs.existsSync(libA) && core.holdsLibrary(libB));
  ml = core.loadLibrary(libB, moveGame);
  let mp = core.plan(ml, moveGame);
  assert.equal(mp.method, "link");
  assert.equal(mp.add.length, 0, "a renamed library keeps the game's hardlinks");

  // Another drive, when this machine has one (the repo's drive differs from the temp folder's on the
  // dev PC and on the CI runner): a checked copy, then copies in the game, then back to hardlinks.
  const otherDrive = path.parse(root).root.toLowerCase() !== path.parse(tmp).root.toLowerCase();
  if (otherDrive) {
    const far = fs.mkdtempSync(path.join(root, ".smoke-move-"));
    try {
      const libC = path.join(far, "lib");
      const before = fs.statSync(path.join(libB, "library", mm.id, "archive", "pc", "mod", "CoolMod.archive")).mtimeMs;
      let seen = 0;
      moved = await core.moveLibrary(libB, libC, (p) => (seen = p.files));
      assert.equal(moved.how, "copy");
      assert.equal(seen, moved.files);
      assert.deepEqual(moved.leftBehind, []);
      assert.ok(!fs.existsSync(libB), "the old folder is gone after the copy");
      assert.ok(Math.abs(fs.statSync(path.join(libC, "library", mm.id, "archive", "pc", "mod", "CoolMod.archive")).mtimeMs - before) < 2000, "the copy keeps modified times");
      ml = core.loadLibrary(libC, moveGame);
      mp = core.plan(ml, moveGame);
      assert.equal(mp.method, "copy", "another drive: copies");
      assert.ok(mp.add.some((d) => d.mod?.id === mm.id), "the hardlinked files are redone as copies");
      assert.ok(core.pendingChanges(ml, moveGame, mp).some((c) => c.kind === "relink" && /a copy instead of a hardlink/.test(c.detail)));
      const r1 = core.deploy(ml, moveGame, new Map());
      assert.equal(r1.method, "copy");
      assert.equal(r1.skipped.length, 0);
      assert.ok(deployed().every((e) => !e.ino), "copies now");
      assert.equal(fs.readFileSync(gameFile, "utf8"), fs.readFileSync(path.join(libC, "library", mm.id, "archive", "pc", "mod", "CoolMod.archive"), "utf8"));
      assert.equal(core.plan(ml, moveGame).add.length, 0, "a second deploy has nothing to do");

      // A cancelled copy leaves the library where it was and removes what it wrote.
      const libD = path.join(tmp, "move-lib-d");
      await assert.rejects(core.moveLibrary(libC, libD, undefined, () => true), /Cancelled/);
      assert.ok(!fs.existsSync(libD) && core.holdsLibrary(libC));

      // Back to the game's drive: copies become hardlinks again.
      moved = await core.moveLibrary(libC, libD);
      assert.equal(moved.how, "copy");
      ml = core.loadLibrary(libD, moveGame);
      mp = core.plan(ml, moveGame);
      assert.equal(mp.method, "link");
      assert.ok(core.pendingChanges(ml, moveGame, mp).some((c) => c.kind === "relink" && /a hardlink instead of a copy/.test(c.detail)));
      core.deploy(ml, moveGame, new Map());
      assert.ok(deployed().every((e) => e.ino), "hardlinks again");
      assert.equal(inode(gameFile), inode(path.join(libD, "library", mm.id, "archive", "pc", "mod", "CoolMod.archive")), "the game's file is the library's file");
    } finally {
      fs.rmSync(far, { recursive: true, force: true });
    }
    console.log("move library: ok (same drive and across drives)");
  } else {
    console.log("move library: ok (same drive only; no second drive here)");
  }
}

// Vortex, if present on this machine: list and classify, import into the temp library, never write.
const vortex = core.listVortexMods(game);
if (vortex.length) {
  const imported = core.importFromVortex(lib, vortex);
  console.log(`vortex: ${vortex.length} mods found, ${imported.added.length} imported, ${imported.skipped.length} skipped`);
  for (const s of imported.skipped) console.log(`  skipped ${s.name}: ${s.reason}`);
  for (const m of imported.added) console.log(`  ${m.name} ${m.version} [${m.kinds.join(" ")}] ${m.files.length} files, ${m.enabled ? "on" : "off"}`);
} else {
  console.log("vortex: not installed here, skipped");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log("smoke: all passed");
