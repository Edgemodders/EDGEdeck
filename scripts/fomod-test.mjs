// Tests the FOMOD reader against the fixtures in scripts/fixtures/fomod.
//   node scripts/fomod-test.mjs       after npm run build
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");
const fx = path.join(import.meta.dirname, "fixtures", "fomod");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edgedeck-fomod-"));

try {
  const basicXml = path.join(fx, "basic", "fomod", "ModuleConfig.xml");
  const { config, text } = core.readModuleConfig(basicXml);
  assert.ok(text.includes("<moduleName>"));
  assert.equal(config.moduleName, "Test Mod");
  assert.deepEqual(config.required, [
    { source: "core\\core.reds", destination: "r6\\scripts\\Test\\core.reds", priority: 0, folder: false },
  ]);
  assert.deepEqual(config.steps.map((s) => s.name), ["Size", "Extras", "Hat colour"]);
  assert.equal(config.steps[0].groups[0].type, "SelectExactlyOne");
  assert.equal(config.steps[0].groups[0].plugins[1].type, "Recommended");
  assert.equal(config.steps[0].groups[0].plugins[0].files[0].source, "size\\small.dat");
  assert.deepEqual(config.steps[1].groups[0].plugins[0].flags, [{ name: "hats", value: "on" }]);
  assert.ok(config.steps[2].visible);
  assert.equal(config.steps[2].groups[0].plugins[0].type, "Optional");

  // UTF-16 LE with BOM parses the same
  const u16 = path.join(tmp, "u16.xml");
  fs.writeFileSync(u16, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(fs.readFileSync(basicXml, "utf8"), "utf16le")]));
  assert.deepEqual(core.readModuleConfig(u16).config, config);

  // Files and folders keep their document order
  const mixed = core.parseModuleConfig(
    '<config><moduleName>M</moduleName><requiredInstallFiles><file source="a" destination="x"/><folder source="b" destination="y" priority="3"/><file source="c" destination="z"/></requiredInstallFiles></config>',
  );
  assert.deepEqual(mixed.required.map((f) => [f.source, f.folder, f.priority]), [["a", false, 0], ["b", true, 3], ["c", false, 0]]);

  // Malformed XML and non-FOMOD files throw
  assert.throws(() => core.parseModuleConfig("<config><moduleName>M</config>"), /not a FOMOD ModuleConfig.xml/);
  assert.throws(() => core.parseModuleConfig("<other/>"), /not a FOMOD ModuleConfig.xml/);

  // Resolver
  const basicRoot = path.join(fx, "basic");
  const ctx = { activeFiles: new Set() };
  const def = core.defaultChoices(config, ctx);
  assert.deepEqual(def.find((c) => c.group === "Size").plugins, ["Large"]);
  let r = core.resolveFomod(config, basicRoot, [{ step: "Size", group: "Size", plugins: ["Small"] }, { step: "Extras", group: "Extras", plugins: [] }], ctx);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.files.map((f) => f.to).sort(), ["archive/pc/mod/size.archive", "r6/scripts/Test/core.reds"]);
  assert.ok(r.files.find((f) => f.to === "archive/pc/mod/size.archive").from.endsWith(path.join("size", "small.dat")));
  assert.deepEqual(r.visibleSteps, ["Size", "Extras"]);
  r = core.resolveFomod(config, basicRoot, [{ step: "Size", group: "Size", plugins: ["Small"] }, { step: "Extras", group: "Extras", plugins: ["Hats"] }], ctx);
  assert.deepEqual(r.visibleSteps, ["Size", "Extras", "Hat colour"]);
  assert.equal(r.flags.hats, "on");
  assert.match(r.errors.join("\n"), /Hat colour.*exactly one/i);
  // A folder with an empty destination lands at the game root; a Missing file dependency makes Gloves unusable
  const gloves = [{ step: "Size", group: "Size", plugins: ["Large"] }, { step: "Extras", group: "Extras", plugins: ["Gloves"] }];
  r = core.resolveFomod(config, basicRoot, gloves, ctx);
  assert.match(r.errors.join("\n"), /Extras.*Gloves.*not usable/i);
  r = core.resolveFomod(config, basicRoot, gloves, { activeFiles: new Set(["archive/pc/mod/other.archive"]) });
  assert.deepEqual(r.errors, []);
  assert.ok(r.files.some((f) => f.to === "r6/tweaks/gloves.dat"));
  // Wrong counts and unknown plugins
  r = core.resolveFomod(config, basicRoot, [{ step: "Size", group: "Size", plugins: ["Small", "Large"] }, { step: "Extras", group: "Extras", plugins: ["Nope"] }], ctx);
  assert.match(r.errors.join("\n"), /Size.*exactly one/i);
  assert.match(r.errors.join("\n"), /Extras.*Nope/);

  // Rules fixture: case-insensitive sources, no destination, priority, folders, SelectAll, conditionals
  const rulesRoot = path.join(fx, "rules");
  const rules = core.readModuleConfig(path.join(rulesRoot, "fomod", "ModuleConfig.xml")).config;
  const pick = (...plugins) => [{ step: "Pick", group: "Pick", plugins }];
  r = core.resolveFomod(rules, rulesRoot, pick(), ctx);
  assert.deepEqual(r.errors, []);
  assert.ok(r.files.some((f) => f.to === "CORE/Core.reds" && f.from.endsWith(path.join("core", "core.reds"))));
  assert.ok(r.files.find((f) => f.to === "archive/pc/mod/p.archive").from.endsWith(path.join("a", "one.dat")));
  assert.ok(r.files.some((f) => f.to === "r6/fixed.txt"));
  assert.ok(!r.files.some((f) => f.to === "r6/both.txt"));
  r = core.resolveFomod(rules, rulesRoot, pick("Two"), ctx);
  assert.ok(r.files.find((f) => f.to === "archive/pc/mod/p.archive").from.endsWith(path.join("b", "two.dat")));
  assert.ok(r.files.some((f) => f.to === "r6/both.txt"));
  r = core.resolveFomod(rules, rulesRoot, pick("Two", "Three"), ctx);
  assert.ok(r.files.find((f) => f.to === "archive/pc/mod/p.archive").from.endsWith(path.join("c", "three.dat")));
  r = core.resolveFomod(rules, rulesRoot, pick("Pack"), ctx);
  assert.ok(r.files.some((f) => f.to === "r6/pack/inner/deep.dat"));

  // gameDependency (and FOMM/FOSE) terms count as met
  const gd = (op, flagVal) => core.parseModuleConfig(
    `<config><moduleName>G</moduleName><conditionalFileInstalls><patterns><pattern><dependencies operator="${op}"><gameDependency version="1.0"/><flagDependency flag="x" value="${flagVal}"/></dependencies><files><file source="core/core.reds" destination="hit.txt"/></files></pattern></patterns></conditionalFileInstalls></config>`,
  );
  assert.equal(core.resolveFomod(gd("Or", "on"), rulesRoot, [], ctx).files.length, 1);
  assert.equal(core.resolveFomod(gd("And", "on"), rulesRoot, [], ctx).files.length, 0);

  // Targets outside the game folder are refused, and paths are tidied
  const dst = (d) => core.parseModuleConfig(
    `<config><moduleName>D</moduleName><requiredInstallFiles><file source="core/core.reds" destination="${d}"/></requiredInstallFiles></config>`,
  );
  for (const bad of ["..\\..\\evil.dll", "C:\\Windows\\x.dll", "\\abs\\x.dll", "/abs/x.dll", "a\\..\\..\\x.dll"]) {
    r = core.resolveFomod(dst(bad), rulesRoot, [], ctx);
    assert.equal(r.files.length, 0, bad);
    assert.match(r.errors.join("\n"), /outside the game folder/, bad);
  }
  r = core.resolveFomod(dst("a\\\\.\\b.txt"), rulesRoot, [], ctx);
  assert.deepEqual(r.files.map((f) => f.to), ["a/b.txt"]);

  // Saved choices and compatibility
  const hashed = (t) => core.configHash(t);
  assert.equal(hashed("<a>  x \n y </a>"), hashed("<a> x y </a>"));
  assert.notEqual(hashed("<a>x</a>"), hashed("<a>y</a>"));
  const saved = { choices: [{ step: "Size", group: "Size", plugins: ["Small"] }, { step: "Extras", group: "Extras", plugins: ["Gloves"] }], configHash: core.configHash(text), structure: core.structureOf(config), from: "edgedeck" };
  const gloveCtx = { activeFiles: new Set(["archive/pc/mod/other.archive"]) };
  const installedOf = (rec) => core.resolveFomod(config, basicRoot, rec.choices, gloveCtx).files.map((f) => f.to);
  const parsed = (t) => core.parseModuleConfig(t);
  let a = core.applySaved(config, text, basicRoot, saved, installedOf(saved), gloveCtx);
  assert.equal(a.compatible, true);
  assert.deepEqual(a.warnings, []);
  assert.deepEqual(a.choices.find((c) => c.group === "Size").plugins, ["Small"]);
  // same hash, but the file dependency now resolves differently (the other mod is gone)
  a = core.applySaved(config, text, basicRoot, saved, installedOf(saved), ctx);
  assert.equal(a.compatible, false);
  assert.ok(a.warnings.some((w) => w.kind === "required" && w.group === "Extras"));
  // same hash, installed list unknown or different: not compatible
  assert.equal(core.applySaved(config, text, basicRoot, saved, undefined, gloveCtx).compatible, false);
  assert.equal(core.applySaved(config, text, basicRoot, saved, ["r6/scripts/Test/core.reds"], gloveCtx).compatible, false);
  // new plugin in a SelectAny group
  const textPlus = text.replace('<plugin name="Gloves">', '<plugin name="Scarf"><description>s</description></plugin><plugin name="Gloves">');
  a = core.applySaved(parsed(textPlus), textPlus, basicRoot, saved, undefined, gloveCtx);
  assert.equal(a.compatible, false);
  assert.deepEqual(a.warnings, [{ step: "Extras", group: "Extras", plugin: "Scarf", kind: "new" }]);
  assert.deepEqual(a.choices.find((c) => c.group === "Extras").plugins, ["Gloves"]);
  // chosen plugin renamed away: gone, the rest kept, default for the group
  const textRen = text.replace('name="Small"', 'name="Tiny"');
  a = core.applySaved(parsed(textRen), textRen, basicRoot, saved, undefined, gloveCtx);
  assert.equal(a.compatible, false);
  assert.ok(a.warnings.some((w) => w.kind === "gone" && w.plugin === "Small" && w.group === "Size"));
  assert.ok(a.warnings.some((w) => w.kind === "new" && w.plugin === "Tiny"));
  assert.deepEqual(a.choices.find((c) => c.group === "Size").plugins, ["Large"]);
  assert.deepEqual(a.choices.find((c) => c.group === "Extras").plugins, ["Gloves"]);
  // a step that vanished
  const textNoExtras = text.replace(/<installStep name="Extras">[\s\S]*?<\/installStep>\s*(?=<installStep name="Hat)/, "");
  assert.notEqual(textNoExtras, text);
  a = core.applySaved(parsed(textNoExtras), textNoExtras, basicRoot, saved, undefined, gloveCtx);
  assert.equal(a.compatible, false);
  assert.ok(a.warnings.some((w) => w.kind === "gone" && w.step === "Extras"));
  // no structure (imported from Vortex): not compatible even when nothing changed; choices kept
  const vortex = { choices: saved.choices, configHash: saved.configHash, from: "vortex" };
  a = core.applySaved(config, text, basicRoot, vortex, installedOf(saved), gloveCtx);
  assert.equal(a.compatible, false);
  assert.deepEqual(a.choices.find((c) => c.group === "Size").plugins, ["Small"]);
  // new SelectAll group: still compatible (hash differs, so the file list is not compared)
  const textAll = text.replace(/<\/optionalFileGroups>(\s*<\/installStep>\s*<installStep name="Extras">)/, '<group name="Always" type="SelectAll"><plugins order="Explicit"><plugin name="Bonus"><description>b</description></plugin></plugins></group></optionalFileGroups>$1');
  assert.notEqual(textAll, text);
  a = core.applySaved(parsed(textAll), textAll, basicRoot, saved, undefined, gloveCtx);
  assert.deepEqual(a.warnings, []);
  assert.equal(a.compatible, true);
  // the same new group needing a choice: not compatible
  const textNewGroup = textAll.replace('type="SelectAll"', 'type="SelectAny"');
  a = core.applySaved(parsed(textNewGroup), textNewGroup, basicRoot, saved, undefined, gloveCtx);
  assert.equal(a.compatible, false);
  assert.deepEqual(a.warnings, [{ step: "Size", group: "Always", kind: "new" }]);
  // a new required pick nobody made: required warning
  const textReq = textAll.replace('type="SelectAll"', 'type="SelectAtLeastOne"').replace('<description>b</description>', '<description>b</description><typeDescriptor><type name="NotUsable"/></typeDescriptor>');
  a = core.applySaved(parsed(textReq), textReq, basicRoot, saved, undefined, gloveCtx);
  assert.equal(a.compatible, false);
  assert.ok(a.warnings.some((w) => w.kind === "required" && w.group === "Always"));

  // A changed group type is a change (SelectAll installs every option)
  const textToAll = text.replace('<group name="Extras" type="SelectAny">', '<group name="Extras" type="SelectAll">');
  assert.notEqual(textToAll, text);
  a = core.applySaved(parsed(textToAll), textToAll, basicRoot, saved, undefined, gloveCtx);
  assert.equal(a.compatible, false);
  assert.ok(a.warnings.some((w) => w.kind === "new" && w.step === "Extras" && w.group === "Extras" && !w.plugin));
  const textToAny = text.replace('<group name="Size" type="SelectExactlyOne">', '<group name="Size" type="SelectAny">');
  assert.notEqual(textToAny, text);
  a = core.applySaved(parsed(textToAny), textToAny, basicRoot, saved, undefined, gloveCtx);
  assert.equal(a.compatible, false);
  assert.deepEqual(a.warnings, [{ step: "Size", group: "Size", kind: "new" }]);

  // Step visibility
  const withHats = { ...saved, choices: [...saved.choices.slice(0, 1), { step: "Extras", group: "Extras", plugins: ["Hats"] }, { step: "Hat colour", group: "Colour", plugins: ["Red"] }] };
  a = core.applySaved(config, text, basicRoot, withHats, installedOf(withHats), gloveCtx);
  assert.equal(a.compatible, true, JSON.stringify(a.warnings));
  const textHide = text.replace('flag="hats" value="on"/>', 'flag="hats" value="never"/>');
  assert.notEqual(textHide, text);
  a = core.applySaved(parsed(textHide), textHide, basicRoot, withHats, undefined, gloveCtx);
  assert.equal(a.compatible, false);
  assert.deepEqual(a.warnings, [{ step: "Hat colour", group: "Colour", kind: "gone" }]);
  const textShow = text.replace('flag="hats" value="on"/>', 'flag="hats" value=""/>');
  a = core.applySaved(parsed(textShow), textShow, basicRoot, saved, undefined, gloveCtx);
  assert.equal(a.compatible, false);
  assert.deepEqual(a.warnings, [{ step: "Hat colour", group: "Colour", kind: "new" }]);

  // completeChoices: every group of every visible step, none for hidden steps
  assert.deepEqual(core.completeChoices(config, basicRoot, saved.choices, gloveCtx), saved.choices);
  assert.deepEqual(
    core.completeChoices(config, basicRoot, [{ step: "Size", group: "Size", plugins: ["Small"] }, { step: "Hat colour", group: "Colour", plugins: ["Red"] }], gloveCtx),
    [{ step: "Size", group: "Size", plugins: ["Small"] }, { step: "Extras", group: "Extras", plugins: [] }],
  );
  assert.deepEqual(
    core.completeChoices(config, basicRoot, withHats.choices, gloveCtx).map((c) => c.step),
    ["Size", "Extras", "Hat colour"],
  );
  // no saved record: defaults, not compatible
  a = core.applySaved(config, text, basicRoot, undefined, undefined, ctx);
  assert.equal(a.compatible, false);
  assert.deepEqual(a.choices, core.defaultChoices(config, ctx));

  // ---- Install pipeline ----
  const mk = (p, c = p) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  const nest = path.join(tmp, "arch");
  mk(path.join(nest, "nested", "TestMod", "FOMOD", "moduleconfig.xml"), "<x/>");
  assert.equal(core.findFomodRoot(nest), path.join(nest, "nested", "TestMod"));
  assert.equal(core.findFomodRoot(basicRoot), basicRoot);
  const plain = path.join(tmp, "plain");
  mk(path.join(plain, "r6", "a.reds"));
  assert.equal(core.findFomodRoot(plain), undefined);
  const deep = path.join(tmp, "deep");
  mk(path.join(deep, "a", "b", "c", "fomod", "ModuleConfig.xml"), "<x/>");
  assert.equal(core.findFomodRoot(deep), undefined);
  mk(path.join(deep, "z", "fomod", "ModuleConfig.xml"), "<x/>");
  assert.equal(core.findFomodRoot(deep), path.join(deep, "z"));

  const game = path.join(tmp, "game");
  fs.mkdirSync(path.join(game, "bin", "x64"), { recursive: true });
  const lib = core.loadLibrary(path.join(tmp, "lib"), game);
  assert.deepEqual([...core.activeFiles(lib)], []);

  // stage + classify the basic resolve
  const res = core.resolveFomod(config, basicRoot, [{ step: "Size", group: "Size", plugins: ["Large"] }, { step: "Extras", group: "Extras", plugins: [] }], ctx);
  const stage = path.join(tmp, "stage");
  assert.deepEqual(core.stageFomod(res, stage), []);
  const cl = core.classify(stage, "Test Mod");
  const got = Object.fromEntries(cl.placements.map((p) => [p.to, p.kind]));
  assert.equal(got["archive/pc/mod/size.archive"], "archive");
  assert.equal(got["r6/scripts/Test/core.reds"], "reds");

  // stage guards
  const bad = (to) => assert.throws(() => core.stageFomod({ files: [{ from: path.join(basicRoot, "core", "core.reds"), to }], flags: {}, visibleSteps: [], errors: [] }, path.join(tmp, "stage2")), /Refusing/);
  bad("");
  bad("a/b:stream");
  bad("C:/x");
  bad("../x");
  bad(["a", "..", "..", "x"].join(String.fromCharCode(92)));
  bad("a/../../x");
  assert.ok(!fs.existsSync(path.join(tmp, "x")));

  // installFomod: new mod, record, no temp left behind
  const stages = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("edgedeck-fomod-stage-")).length;
  const before = stages();
  const opts = { name: "Test Mod", version: "1.0", source: { type: "folder", path: basicRoot }, root: basicRoot, cfg: config, text, from: "edgedeck",
    choices: [{ step: "Size", group: "Size", plugins: ["Large"] }] };
  const inst = core.installFomod(lib, opts);
  assert.equal(stages(), before);
  assert.deepEqual(inst.mod.files, ["archive/pc/mod/size.archive", "r6/scripts/Test/core.reds"]);
  assert.deepEqual(inst.mod.fomod.choices, [{ step: "Size", group: "Size", plugins: ["Large"] }, { step: "Extras", group: "Extras", plugins: [] }]);
  assert.equal(inst.mod.fomod.configHash, core.configHash(text));
  assert.equal(inst.mod.fomod.from, "edgedeck");
  assert.deepEqual(inst.mod.fomod.structure, core.structureOf(config));
  assert.equal(core.loadLibrary(lib.root, game).mods[0].fomod.configHash, core.configHash(text));
  assert.ok([...core.activeFiles(lib)].includes("r6/scripts/test/core.reds"));

  // errors in the choices throw and add nothing
  assert.throws(() => core.installFomod(lib, { ...opts, name: "Other", choices: [{ step: "Size", group: "Size", plugins: ["Nope"] }] }), /no option "Nope"/);
  assert.equal(lib.mods.length, 1);
  assert.equal(stages(), before);

  // inferChoices from the installed bytes
  assert.deepEqual(core.inferChoices(config, basicRoot, lib, inst.mod).find((c) => c.group === "Size").plugins, ["Large"]);
  const lm = path.join(core.modFolder(lib, inst.mod), "archive", "pc", "mod", "size.archive");
  fs.copyFileSync(path.join(basicRoot, "size", "small.dat"), lm);
  const inf = core.inferChoices(config, basicRoot, lib, inst.mod);
  assert.deepEqual(inf.find((c) => c.group === "Size").plugins, ["Small"]);
  assert.deepEqual(inf.find((c) => c.group === "Extras").plugins, []);

  // replaceModFiles: drops a file the new placements lack, keeps the id
  const folder = core.modFolder(lib, inst.mod);
  fs.writeFileSync(path.join(folder, "r6", "scripts", "Test", "stale.reds"), "x");
  inst.mod.files.push("r6/scripts/Test/stale.reds");
  const again = core.installFomod(lib, { ...opts, replace: inst.mod, choices: [{ step: "Size", group: "Size", plugins: ["Small"] }] });
  assert.equal(again.mod.id, inst.mod.id);
  assert.equal(lib.mods.length, 1);
  assert.ok(!fs.existsSync(path.join(folder, "r6", "scripts", "Test", "stale.reds")));
  assert.deepEqual(again.mod.files, ["archive/pc/mod/size.archive", "r6/scripts/Test/core.reds"]);
  assert.deepEqual(fs.readFileSync(lm), fs.readFileSync(path.join(basicRoot, "size", "small.dat")));

  // replaceModFiles is all or nothing
  const keep = path.join(core.modFolder(lib, again.mod), "archive", "pc", "mod", "size.archive");
  const oldBytes = fs.readFileSync(keep);
  const oldJson = fs.readFileSync(path.join(core.modFolder(lib, again.mod), "mod.json"), "utf8");
  const oldFiles = [...again.mod.files];
  assert.throws(() => core.replaceModFiles(lib, again.mod, [
    { from: path.join(basicRoot, "size", "large.dat"), to: "archive/pc/mod/size.archive", kind: "archive" },
    { from: path.join(tmp, "does-not-exist"), to: "r6/scripts/Test/x.reds", kind: "reds" },
  ]));
  assert.deepEqual(fs.readFileSync(keep), oldBytes);
  assert.equal(fs.readFileSync(path.join(core.modFolder(lib, again.mod), "mod.json"), "utf8"), oldJson);
  assert.deepEqual(again.mod.files, oldFiles);
  assert.ok(fs.existsSync(path.join(core.modFolder(lib, again.mod), "r6", "scripts", "Test", "core.reds")));
  assert.deepEqual(fs.readdirSync(core.libraryFolder(lib.root)).filter((n) => /\.(new|old)-/.test(n)), []);

  // A held handle on the old folder after the swap: replace still returns, the mod is listed once
  const cjsFs = require("node:fs");
  const realRm = cjsFs.rmSync;
  cjsFs.rmSync = (p, o) => { if (String(p).includes(".old-")) throw Object.assign(new Error("EBUSY"), { code: "EBUSY" }); return realRm(p, o); };
  try {
    core.replaceModFiles(lib, again.mod, [{ from: path.join(basicRoot, "size", "large.dat"), to: "archive/pc/mod/size.archive", kind: "archive" }]);
  } finally { cjsFs.rmSync = realRm; }
  assert.deepEqual(again.mod.files, ["archive/pc/mod/size.archive"]);
  const libDir = core.libraryFolder(lib.root);
  const leftovers = () => fs.readdirSync(libDir).filter((n) => /[.](new|old)-/.test(n));
  const left = leftovers();
  assert.equal(left.length, 1);
  assert.ok(!fs.existsSync(path.join(libDir, left[0], "mod.json")));
  fs.mkdirSync(path.join(libDir, "crash.new-1"));
  fs.writeFileSync(path.join(libDir, "crash.new-1", "mod.json"), JSON.stringify(again.mod));
  fs.mkdirSync(path.join(libDir, "crash.old-1"));
  fs.writeFileSync(path.join(libDir, "crash.old-1", "mod.json"), JSON.stringify(again.mod));
  const reopened = core.loadLibrary(lib.root, game);
  assert.equal(reopened.mods.filter((m) => m.id === again.mod.id).length, 1);
  assert.equal(reopened.mods.length, lib.mods.length);
  for (const n of leftovers()) fs.rmSync(path.join(libDir, n), { recursive: true, force: true });

  // familyForDownload: case and slash insensitive
  const dl = path.join(tmp, "downloads", "Some Mod-1-0.zip");
  const m2 = core.addMod(lib, cl.placements, { name: "Dl", source: { type: "nexus", path: dl } });
  assert.equal(core.familyForDownload(lib, dl.toUpperCase().split(path.sep).join("/")).id, m2.id);
  assert.equal(core.familyForDownload(lib, path.join(tmp, "other.zip")), undefined);

  // verbs.add: questions, choices, silent reinstall, download family
  const sevenZa = path.join(import.meta.dirname, "..", "node_modules", "7zip-bin", "win", "x64", "7za.exe");
  const vlib = core.loadLibrary(path.join(tmp, "vlib"), game);
  const sess = { lib: vlib, libraryRoot: vlib.root, game, sevenZa };
  await assert.rejects(() => core.verbs.add(sess, basicRoot), (e) => {
    assert.match(e.message, /Size \/ Size \(SelectExactlyOne\): Small, Large/);
    assert.match(e.message, /fomodChoices/);
    return true;
  });
  assert.equal(vlib.mods.length, 0);
  const picks = [{ step: "Size", group: "Size", plugins: ["Small"] }];
  const r1 = await core.verbs.add(sess, basicRoot, undefined, undefined, picks);
  assert.equal(r1.data.added.files, 2);
  const m1 = vlib.mods[0];
  assert.equal(m1.fomod.from, "edgedeck");
  assert.equal(JSON.parse(fs.readFileSync(path.join(core.modFolder(vlib, m1), "mod.json"), "utf8")).fomod.from, "edgedeck");
  await assert.rejects(() => core.verbs.add(sess, basicRoot, undefined, undefined, [{ step: "Size", group: "Size", plugins: ["Nope"] }]), /no option "Nope"/);
  const r2 = await core.verbs.add(sess, basicRoot);
  assert.equal(vlib.mods.length, 1);
  assert.equal(r2.data.added.id, m1.id);
  assert.deepEqual(vlib.mods[0].fomod.choices.find((c) => c.group === "Size").plugins, ["Small"]);
  // inferred records are never silent
  vlib.mods[0].fomod.from = "inferred";
  await assert.rejects(() => core.verbs.add(sess, basicRoot), /guessed/);
  vlib.mods[0].fomod.from = "edgedeck";

  // a kept download: the new mod inherits the Nexus data of the download's mod
  if (fs.existsSync(sevenZa)) {
    const { execFileSync } = require("node:child_process");
    const zipDir = path.join(tmp, "zips");
    fs.mkdirSync(zipDir);
    const zipFile = path.join(zipDir, "Basic Pack-1-0.zip");
    execFileSync(sevenZa, ["a", "-tzip", zipFile, path.join(basicRoot, "*")], { stdio: "ignore" });
    const dlib = core.loadLibrary(path.join(tmp, "dlib"), game);
    const ds = { lib: dlib, libraryRoot: dlib.root, game, sevenZa };
    const kept = path.join(core.downloadsFolder(dlib.root), "Basic Pack-1-0.zip");
    fs.mkdirSync(path.dirname(kept), { recursive: true });
    const stub = core.addMod(dlib, cl.placements, { name: "Basic Pack", version: "", source: { type: "nexus", path: kept, modId: 77, fileId: 5, fileTitle: "Main" } });
    await assert.rejects(() => core.verbs.add(ds, zipFile), /Size \/ Size/);
    const rz = await core.verbs.add(ds, zipFile, undefined, undefined, picks);
    // same version as the family's active mod: reinstalled over it
    assert.equal(dlib.mods.length, 1);
    assert.equal(rz.data.added.id, stub.id);
    assert.equal(dlib.mods[0].fomod.from, "edgedeck");
    // a different version: a new entry that keeps the Nexus ids and the kept download
    const rn = await core.verbs.add(ds, zipFile);
    assert.equal(rn.data.added.id, stub.id);

    // Versions: the kept download's own version, the file name's, the family's
    const mkzip = (name) => {
      const f = path.join(zipDir, name);
      execFileSync(sevenZa, ["a", "-tzip", f, path.join(basicRoot, "*")], { stdio: "ignore" });
      return f;
    };
    const vl = core.loadLibrary(path.join(tmp, "vlib2"), game);
    const vs = { lib: vl, libraryRoot: vl.root, game, sevenZa };
    const other1 = core.addMod(vl, cl.placements, { name: "Zed One", source: { type: "folder", path: basicRoot } });
    const keptV = path.join(core.downloadsFolder(vl.root), "Basic Pack-123-1-9-1-1699999999.zip");
    const act = core.addMod(vl, cl.placements, { name: "Basic Pack", version: "1.9.1", source: { type: "nexus", path: keptV, modId: 123, fileId: 9, fileTitle: "Main" } });
    const other2 = core.addMod(vl, cl.placements, { name: "Zed Two", source: { type: "folder", path: basicRoot } });
    const orderBefore = vl.mods.map((m) => m.id);
    const sameFile = mkzip("Basic Pack-123-1-9-1-1699999999.zip");
    await core.verbs.add(vs, sameFile, undefined, undefined, picks);
    const famMods = () => vl.mods.filter((m) => m.source.modId === 123);
    assert.equal(famMods().length, 1);
    assert.equal(famMods()[0].id, act.id);
    assert.equal(famMods()[0].version, "1.9.1");
    assert.equal(famMods()[0].enabled, true);
    assert.deepEqual(vl.mods.map((m) => m.id), orderBefore);
    assert.equal(famMods()[0].source.fileId, 9);
    assert.equal(famMods()[0].source.fileTitle, "Main");
    assert.equal(path.resolve(famMods()[0].source.path).toLowerCase(), path.resolve(keptV).toLowerCase());
    assert.equal(famMods()[0].fomod.from, "edgedeck");
    // another version of the page: its own entry with that version, the old one off
    const v2 = mkzip("Basic Pack-123-2-0-1699999999.zip");
    const r2v = await core.verbs.add(vs, v2);
    assert.equal(r2v.data.added.version, "2.0");
    assert.equal(vl.mods.find((m) => m.id === act.id).enabled, false);
    // ...in the same family: it keeps the page's Nexus id, and its source is the kept download
    const newEntry = vl.mods.find((m) => m.id === r2v.data.added.id);
    assert.notEqual(newEntry.id, act.id);
    assert.equal(newEntry.source.modId, 123);
    const keptV2 = path.join(core.downloadsFolder(vl.root), path.basename(v2));
    assert.equal(path.resolve(newEntry.source.path).toLowerCase(), path.resolve(keptV2).toLowerCase());
    assert.ok(fs.existsSync(keptV2));
    assert.equal(core.familyOf(vl, newEntry).key, core.familyOf(vl, vl.mods.find((m) => m.id === act.id)).key);
    // no version information with an existing family: replaces the active mod
    const vl3 = core.loadLibrary(path.join(tmp, "vlib3"), game);
    const vs3 = { lib: vl3, libraryRoot: vl3.root, game, sevenZa };
    const fam3 = core.addMod(vl3, cl.placements, { name: "Basic Pack", version: "3.0", source: { type: "file", path: path.join(tmp, "gone.zip") } });
    await core.verbs.add(vs3, mkzip("Basic Pack.zip"), undefined, undefined, picks);
    assert.equal(vl3.mods.length, 1);
    assert.equal(vl3.mods[0].id, fam3.id);
    assert.equal(vl3.mods[0].version, "3.0");
    assert.equal(path.basename(vl3.mods[0].source.path), "Basic Pack.zip");
    await core.verbs.add(vs3, mkzip("Basic Pack.zip"));
    assert.equal(vl3.mods.length, 1);
  }

  // The installer window's view model
  {
    const vctx = { activeFiles: new Set(["archive/pc/mod/other.archive"]) };
    // a new plugin since the saved structure: its step is marked, the plugin is new, Install stays possible
    const plusCfg = parsed(textPlus);
    const ap = core.applySaved(plusCfg, textPlus, basicRoot, saved, undefined, vctx);
    let v = core.installerView(plusCfg, basicRoot, ap.choices, ap.warnings, vctx);
    assert.deepEqual(v.steps.map((s) => [s.name, s.mark]), [["Size", "ok"], ["Extras", "warn"]]);
    const extras = v.steps.find((s) => s.name === "Extras").groups[0];
    assert.equal(extras.type, "SelectAny");
    assert.equal(extras.plugins.find((p) => p.name === "Scarf").isNew, true);
    assert.equal(extras.plugins.find((p) => p.name === "Gloves").isNew, false);
    assert.equal(extras.plugins.find((p) => p.name === "Gloves").checked, true);
    assert.equal(extras.plugins.find((p) => p.name === "Hats").checked, false);
    assert.equal(extras.plugins.find((p) => p.name === "Hats").description, "Adds hats.");
    assert.equal(v.canInstall, true);
    // a pick-one group with nothing picked: its step is marked and Install is off
    v = core.installerView(config, basicRoot, [{ step: "Size", group: "Size", plugins: [] }, { step: "Extras", group: "Extras", plugins: [] }], [], vctx);
    assert.equal(v.steps.find((s) => s.name === "Size").mark, "warn");
    assert.equal(v.canInstall, false);
    // Gloves is not usable without the other mod; a step that shows up with a pick is listed
    v = core.installerView(config, basicRoot, [{ step: "Size", group: "Size", plugins: ["Large"] }, { step: "Extras", group: "Extras", plugins: ["Hats"] }], [], ctx);
    assert.equal(v.steps.find((s) => s.name === "Extras").groups[0].plugins.find((p) => p.name === "Gloves").disabled, true);
    assert.deepEqual(v.steps.map((s) => [s.name, s.mark]), [["Size", "ok"], ["Extras", "ok"], ["Hat colour", "warn"]]);
    assert.equal(v.canInstall, false);
    // a Required plugin is checked and locked
    const reqText = text.replace('<type name="Recommended"/>', '<type name="Required"/>');
    const reqCfg = parsed(reqText);
    v = core.installerView(reqCfg, basicRoot, core.defaultChoices(reqCfg, ctx), [], ctx);
    const large = v.steps[0].groups[0].plugins.find((p) => p.name === "Large");
    assert.equal(large.checked && large.locked, true);
    assert.equal(v.steps[0].groups[0].plugins.find((p) => p.name === "Small").locked, false);
    assert.equal(v.canInstall, true);
    // the image path comes as the installer names it, with forward slashes
    const imgCfg = parsed(text.replace("<description>The small one.</description>", '<description>The small one.</description><image path="fomod\\images\\small.png"/>'));
    v = core.installerView(imgCfg, basicRoot, core.defaultChoices(imgCfg, ctx), [], ctx);
    assert.equal(v.steps[0].groups[0].plugins.find((p) => p.name === "Small").image, "fomod/images/small.png");
    // toggling: a pick-one group takes the new pick, a pick-any group adds and drops
    let ch = core.toggleChoice(config, [{ step: "Size", group: "Size", plugins: ["Large"] }], "Size", "Size", "Small");
    assert.deepEqual(ch.find((c) => c.group === "Size").plugins, ["Small"]);
    ch = core.toggleChoice(config, ch, "Extras", "Extras", "Hats");
    assert.deepEqual(ch.find((c) => c.group === "Extras").plugins, ["Hats"]);
    ch = core.toggleChoice(config, ch, "Extras", "Extras", "Hats");
    assert.deepEqual(ch.find((c) => c.group === "Extras").plugins, []);
    // settleChoices puts a Required plugin back in and takes a not usable one out
    const settled = core.settleChoices(reqCfg, [{ step: "Size", group: "Size", plugins: ["Small"] }, { step: "Extras", group: "Extras", plugins: ["Gloves"] }], ctx);
    assert.deepEqual(settled.find((c) => c.group === "Size").plugins, ["Large"]);
    assert.deepEqual(settled.find((c) => c.group === "Extras").plugins, []);
  }

  // What a prepared FOMOD does: never a window in a quiet add (Update all)
  {
    const act = { id: "a" }, tgt = { id: "t" };
    assert.deepEqual(core.fomodAddStep({ silent: true, active: act }, { quiet: true }), { action: "install" });
    assert.deepEqual(core.fomodAddStep({ silent: false, active: act }, { quiet: true }), { action: "hold", holder: act });
    // a quiet reinstall over a version the library has: held on that mod, no window
    assert.deepEqual(core.fomodAddStep({ silent: false, target: tgt }, { quiet: true }), { action: "hold", holder: tgt });
    assert.deepEqual(core.fomodAddStep({ silent: false, active: act, target: tgt }, { quiet: true }), { action: "hold", holder: act });
    // a download the user pressed: the window, and Cancel keeps a new version waiting
    assert.deepEqual(core.fomodAddStep({ silent: false, active: act }, {}), { action: "window", holder: act });
    assert.deepEqual(core.fomodAddStep({ silent: false, active: act, target: tgt }, {}), { action: "window", holder: undefined });
    assert.deepEqual(core.fomodAddStep({ silent: false, active: act }, undefined), { action: "window", holder: undefined });
    // a Nexus file the library has: reinstall only from a pressed link with the kept file
    assert.equal(core.sameVersionStep({ fomod: true, keptFile: true, key: "k", quiet: false }), "reinstall");
    assert.equal(core.sameVersionStep({ fomod: true, keptFile: true, key: undefined, quiet: false }), "activate");
    assert.equal(core.sameVersionStep({ fomod: true, keptFile: true, key: "k", quiet: true }), "activate");
    assert.equal(core.sameVersionStep({ fomod: true, keptFile: false, key: "k", quiet: false }), "activate");
    assert.equal(core.sameVersionStep({ fomod: false, keptFile: true, key: "k", quiet: false }), "activate");
  }

  // Final review fixes
  {
    const same = (src) => ({ source: src, folder: src, isFile: false });
    // 1. Reinstalling to change options opens the window even when the saved choices fit; Update all never does
    const act = { id: "a" }, tgt = { id: "t" };
    assert.deepEqual(core.fomodAddStep({ silent: true, target: tgt }, undefined), { action: "window", holder: undefined });
    assert.deepEqual(core.fomodAddStep({ silent: true, active: act, target: tgt }, {}), { action: "window", holder: undefined });
    assert.deepEqual(core.fomodAddStep({ silent: true, active: act, target: tgt }, { quiet: true }), { action: "install" });
    assert.deepEqual(core.fomodAddStep({ silent: false, active: act, target: tgt }, { quiet: true }), { action: "hold", holder: act });
    assert.deepEqual(core.fomodAddStep({ silent: true, active: act }, {}), { action: "install" });
    const rlib = core.loadLibrary(path.join(tmp, "rlib"), game);
    core.finishFomodAdd(rlib, core.prepareFomodAdd(rlib, same(basicRoot)), picks);
    const p1 = core.prepareFomodAdd(rlib, same(basicRoot));
    assert.ok(p1.target);
    assert.equal(p1.silent, true);
    assert.equal(core.fomodAddStep(p1, undefined).action, "window");
    assert.equal(core.fomodAddStep(p1, { quiet: true }).action, "install");

    // 2. Same installer re-added: compared by the FOMOD's own targets, so files classify drops (a readme) do not count
    const b2 = path.join(tmp, "readme-mod");
    fs.cpSync(basicRoot, b2, { recursive: true });
    fs.writeFileSync(path.join(b2, "extras", "gloves", "readme.txt"), "read me");
    // a conditional file that only installs while the other mod's file is active
    const xml2 = path.join(b2, "fomod", "ModuleConfig.xml");
    fs.writeFileSync(xml2, fs.readFileSync(xml2, "utf8").replace("</config>", '<conditionalFileInstalls><patterns><pattern><dependencies><fileDependency file="archive\\pc\\mod\\other.archive" state="Active"/></dependencies><files><file source="core\\core.reds" destination="r6\\scripts\\Test\\cond.reds"/></files></pattern></patterns></conditionalFileInstalls></config>'));
    const rl = core.loadLibrary(path.join(tmp, "rdlib"), game);
    const other = core.addMod(rl, [{ from: path.join(basicRoot, "size", "small.dat"), to: "archive/pc/mod/other.archive", kind: "archive" }], { name: "Other", source: { type: "folder", path: basicRoot } });
    const gl = [{ step: "Size", group: "Size", plugins: ["Small"] }, { step: "Extras", group: "Extras", plugins: ["Gloves"] }];
    const { mod: rm } = core.finishFomodAdd(rl, core.prepareFomodAdd(rl, same(b2)), gl);
    assert.ok(!rm.files.includes("readme.txt"));
    assert.ok(rm.fomod.targets.includes("readme.txt"));
    assert.ok(rm.fomod.targets.includes("r6/scripts/test/cond.reds"));
    assert.equal(core.prepareFomodAdd(rl, same(b2)).applied.compatible, true);
    // an older record without targets: the staged and classified result is compared with the mod's files
    delete rm.fomod.targets;
    assert.equal(core.prepareFomodAdd(rl, same(b2)).applied.compatible, true);
    // a fileDependency that resolves differently now: not compatible
    core.finishFomodAdd(rl, core.prepareFomodAdd(rl, same(b2)), [{ step: "Size", group: "Size", plugins: ["Small"] }, { step: "Extras", group: "Extras", plugins: [] }]);
    assert.equal(core.prepareFomodAdd(rl, same(b2)).applied.compatible, true);
    other.enabled = false;
    core.saveMod(rl, other);
    const off = core.prepareFomodAdd(rl, same(b2));
    assert.equal(off.applied.compatible, false);
    assert.deepEqual(off.applied.warnings, []);
    other.enabled = true;
    core.saveMod(rl, other);

    // 6. replaceModFiles: a carried file never overwrites a new placement that differs only in case
    const cl6 = core.loadLibrary(path.join(tmp, "clib"), game);
    const small = path.join(basicRoot, "size", "small.dat");
    const large = path.join(basicRoot, "size", "large.dat");
    const m6 = core.addMod(cl6, [{ from: small, to: "archive/pc/mod/a.archive", kind: "archive" }], { name: "Case", source: { type: "folder", path: basicRoot } });
    fs.writeFileSync(path.join(core.modFolder(cl6, m6), "archive", "pc", "mod", "Notes.TXT"), "old notes");
    core.replaceModFiles(cl6, m6, [{ from: small, to: "archive/pc/mod/a.archive", kind: "archive" }, { from: large, to: "archive/pc/mod/notes.txt", kind: "archive" }]);
    const notes = fs.readdirSync(path.join(core.modFolder(cl6, m6), "archive", "pc", "mod")).find((n) => n.toLowerCase() === "notes.txt");
    assert.deepEqual(fs.readFileSync(path.join(core.modFolder(cl6, m6), "archive", "pc", "mod", notes)), fs.readFileSync(large));

    // 7. Given choices naming a step or group the installer lacks are refused, listing them
    const glib = core.loadLibrary(path.join(tmp, "glib"), game);
    const gs = { lib: glib, libraryRoot: glib.root, game, sevenZa };
    await assert.rejects(() => core.verbs.add(gs, basicRoot, undefined, undefined, [...picks, { step: "Nope", group: "Size", plugins: [] }, { step: "Size", group: "Wrong", plugins: ["Small"] }]), (e) => {
      assert.match(e.message, /Nope \/ Size/);
      assert.match(e.message, /Size \/ Wrong/);
      return true;
    });
    assert.equal(glib.mods.length, 0);
    // the command line checks each entry's shape
    {
      const { spawnSync } = require("node:child_process");
      const cli = path.join(import.meta.dirname, "..", "bin", "edgedeck.mjs");
      const r7 = spawnSync(process.execPath, [cli, "add", basicRoot, "--library", path.join(tmp, "clilib"), "--game", game, "--fomod-choices", JSON.stringify([{ step: "Size", group: "Size", plugins: "Small" }])], { encoding: "utf8" });
      assert.equal(r7.status, 1);
      assert.match(r7.stderr, /fomod-choices/);
      assert.match(r7.stderr, /entry 1/);
    }

    // 8. Output that classifies as a choice of folders says so, naming them
    const optCfg = core.parseModuleConfig('<config><moduleName>O</moduleName><requiredInstallFiles><file source="size\\small.dat" destination="Alpha\\a.archive"/><file source="size\\large.dat" destination="Beta\\b.archive"/></requiredInstallFiles></config>');
    assert.throws(() => core.installFomod(cl6, { name: "Opts", source: { type: "folder", path: basicRoot }, root: basicRoot, cfg: optCfg, text: "x", choices: [], from: "edgedeck" }), (e) => {
      assert.match(e.message, /could not be placed/);
      assert.match(e.message, /Alpha/);
      assert.match(e.message, /Beta/);
      return true;
    });

    // 9. A window that waited: prepared again, it sees the mod another window added meanwhile
    const qlib = core.loadLibrary(path.join(tmp, "qlib"), game);
    const waited = core.prepareFomodAdd(qlib, same(basicRoot));
    assert.equal(waited.target, undefined);
    core.finishFomodAdd(qlib, core.prepareFomodAdd(qlib, same(basicRoot)), picks);
    const fresh = core.reprepareFomodAdd(qlib, waited);
    assert.equal(fresh.target?.id, qlib.mods[0].id);
    core.finishFomodAdd(qlib, fresh, picks);
    assert.equal(qlib.mods.length, 1);

    // 10. A parser error reads as "not a FOMOD"
    assert.throws(() => core.parseModuleConfig('<!DOCTYPE config [<!DOCTYPE inner [<!ENTITY a "x">]>]><config/>'), /not a FOMOD ModuleConfig.xml/);
  }

  // Vortex's LevelDB read without a native module: tables, log, overwrites and deletions
  {
    let ClassicLevel;
    try {
      ({ ClassicLevel } = require("classic-level"));
    } catch (e) {
      console.log(`note: classic-level did not load (${String(e.message).slice(0, 80)}), LevelDB reader test skipped`);
    }
    if (ClassicLevel) {
      const dbDir = path.join(tmp, "leveldb");
      const pre = "persistent###mods###cyberpunk2077###";
      const key = (i) => `${pre}m${i}###attributes###installerChoices###options`;
      const val = (i, tag) => JSON.stringify({ i, tag, pad: i % 2 ? "x".repeat(4000) : crypto.randomBytes(2000).toString("hex") });
      let db = new ClassicLevel(dbDir);
      await db.open();
      for (let i = 0; i < 2000; i++) await db.put(key(i), val(i, "first"));
      await db.put("other###key", "ignored");
      await db.close();
      db = new ClassicLevel(dbDir);
      await db.open();
      const batch = db.batch();
      for (let i = 0; i < 10; i++) batch.put(key(i), val(i, "second"));
      for (let i = 10; i < 20; i++) batch.del(key(i));
      await batch.write();
      await db.close();
      const files = fs.readdirSync(dbDir);
      assert.ok(files.some((f) => /.(ldb|sst)$/.test(f)), "the database has table files");
      assert.ok(files.some((f) => f.endsWith(".log")), "the database has a log");
      const got = core.readLevelDb(dbDir, pre);
      assert.equal(got.size, 1990);
      assert.equal(JSON.parse(got.get(key(3))).tag, "second");
      assert.equal(JSON.parse(got.get(key(500))).tag, "first");
      assert.equal(JSON.parse(got.get(key(501))).i, 501);
      assert.equal(got.has(key(15)), false);
      assert.equal(core.readLevelDb(dbDir, "other###").get("other###key"), "ignored");
      assert.deepEqual(fs.readdirSync(dbDir).sort(), files.sort(), "the original folder is untouched");
    }
  }

  // Importing the FOMOD choices Vortex kept
  {
    let ClassicLevel;
    try {
      ({ ClassicLevel } = require("classic-level"));
    } catch (e) {
      console.log(`note: classic-level did not load (${String(e.message).slice(0, 80)}), Vortex choices test skipped`);
    }
    if (ClassicLevel) {
      const stateDir = path.join(tmp, "vstate");
      const pre = "persistent###mods###cyberpunk2077###";
      const opts = (step, group, names) => JSON.stringify([{ name: step, groups: [{ name: group, choices: names.map((name, idx) => ({ name, idx })) }] }]);
      const db = new ClassicLevel(stateDir);
      await db.open();
      const put = (id, attr, v) => db.put(`${pre}${id}###attributes###${attr}`, v);
      await put("Zed Cape-11-1-0-111", "installerChoices###options", opts("Colour", "Colour", ["Red"]));
      await put("Zed Cape-11-1-0-111", "installerChoices###type", JSON.stringify("fomod"));
      // value that is JSON inside a JSON string; found by mod id and version
      await put("Quux Boots-22-2-0-222", "installerChoices###options", JSON.stringify(opts("Size", "Size", ["Big", "Wide"])));
      await put("Quux Boots-22-2-0-222", "installerChoices###type", JSON.stringify("fomod"));
      await put("Quux Boots-22-2-0-222", "modId", JSON.stringify(22));
      await put("Quux Boots-22-2-0-222", "version", JSON.stringify("2.0"));
      await put("Mine-33-1-0-333", "installerChoices###options", opts("A", "A", ["x"]));
      await put("Mine-33-1-0-333", "installerChoices###type", JSON.stringify("fomod"));
      await put("Gone-44-1-0-444", "installerChoices###options", opts("A", "A", ["x"]));
      await put("Gone-44-1-0-444", "installerChoices###type", JSON.stringify("fomod"));
      for (const [id, n] of [["Twin A-77-3-0-1", "A"], ["Twin B-77-3-0-2", "B"]]) {
        await put(id, "installerChoices###options", opts("S", "S", [n]));
        await put(id, "installerChoices###type", JSON.stringify("fomod"));
        await put(id, "modId", JSON.stringify(77));
        await put(id, "version", JSON.stringify("3.0"));
      }
      await put("Held Cloak-99-1-0-9", "installerChoices###options", opts("Cut", "Cut", ["Long"]));
      await put("Held Cloak-99-1-0-9", "installerChoices###type", JSON.stringify("fomod"));
      await put("Empty-88-1-0-8", "installerChoices###options", "[]");
      await put("Empty-88-1-0-8", "installerChoices###type", JSON.stringify("fomod"));
      await put("Plain-55-1-0-555", "installerChoices###type", JSON.stringify("unknown"));
      await put("Other-66-1-0-666", "installerChoices###options", opts("A", "A", ["x"]));
      await put("Other-66-1-0-666", "installerChoices###type", JSON.stringify("other"));
      await db.close();

      const list = core.readVortexChoices(stateDir);
      assert.deepEqual(list.map((v) => v.vortexId).sort(), ["Gone-44-1-0-444", "Held Cloak-99-1-0-9", "Mine-33-1-0-333", "Quux Boots-22-2-0-222", "Twin A-77-3-0-1", "Twin B-77-3-0-2", "Zed Cape-11-1-0-111"]);
      const quux = list.find((v) => v.vortexId.startsWith("Quux"));
      assert.deepEqual(quux, { vortexId: "Quux Boots-22-2-0-222", modId: 22, version: "2.0", choices: [{ step: "Size", group: "Size", plugins: ["Big", "Wide"] }] });

      const vlib = core.loadLibrary(path.join(tmp, "vlib"), game);
      const mkMod = (id, source, extra = {}) => {
        const mod = { id, name: id, version: "1.0", kinds: ["archive"], enabled: true, added: "2026-11-09", source, files: [], ...extra };
        fs.mkdirSync(core.modFolder(vlib, mod), { recursive: true });
        vlib.mods.push(mod);
        core.saveMod(vlib, mod);
        return mod;
      };
      // A Windows path with backslashes, a path with slashes, and a mod found by id and version
      mkMod("zed-cape", { type: "vortex", path: "C:\\Staging\\cyberpunk2077\\Zed Cape-11-1-0-111" });
      mkMod("quux-boots", { type: "vortex", path: "D:/else/where/renamed", modId: 22 }, { version: "2.0" });
      mkMod("mine", { type: "vortex", path: "C:\\Staging\\Mine-33-1-0-333" }, { fomod: { choices: [{ step: "A", group: "A", plugins: ["mine"] }], configHash: "h", from: "edgedeck" } });
      mkMod("old-guess", { type: "vortex", path: "C:\\Staging\\Plain-55-1-0-555" }, { fomod: { choices: [], configHash: "", from: "inferred" } });
      mkMod("not-vortex", { type: "folder", path: "C:\\Staging\\Gone-44-1-0-444" });
      mkMod("twin", { type: "vortex", path: "D:/moved/twin", modId: 77 }, { version: "3.0" });
      mkMod("held", { type: "vortex", path: "C:\\Staging\\Held Cloak-99-1-0-9" }, { fomod: { choices: [], configHash: "", from: "inferred", pending: { download: "D:/dl/Held Cloak-99-2-0-9.zip", version: "2.0" } } });
      mkMod("empty-one", { type: "vortex", path: "C:\\Staging\\Empty-88-1-0-8" }, { fomod: { choices: [], configHash: "", from: "inferred" } });
      const modJson = (id) => JSON.parse(fs.readFileSync(path.join(core.modFolder(vlib, { id }), "mod.json"), "utf8"));
      const before = modJson("zed-cape");
      const r = core.importVortexChoices(vlib, list);
      const { fomod: _f, ...afterRest } = modJson("zed-cape");
      const { fomod: _g, ...beforeRest } = before;
      assert.deepEqual(afterRest, beforeRest, "only fomod changes in mod.json");
      assert.equal(modJson("twin").fomod, undefined, "two files at one modId and version are ambiguous");
      assert.deepEqual(modJson("empty-one").fomod, { choices: [], configHash: "", from: "inferred" });
      assert.deepEqual(r.matched.map((m) => m.id).sort(), ["held", "quux-boots", "zed-cape"]);
      // an update waiting for review stays waiting
      assert.deepEqual(modJson("held").fomod, { choices: [{ step: "Cut", group: "Cut", plugins: ["Long"] }], configHash: "", from: "vortex", pending: { download: "D:/dl/Held Cloak-99-2-0-9.zip", version: "2.0" } });
      assert.deepEqual(r.skipped, ["mine"]);
      assert.deepEqual(r.unmatched.sort(), ["Gone-44-1-0-444", "Twin A-77-3-0-1", "Twin B-77-3-0-2"]);
      const back = core.loadLibrary(vlib.root, game);
      assert.deepEqual(back.mods.find((m) => m.id === "zed-cape").fomod, { choices: [{ step: "Colour", group: "Colour", plugins: ["Red"] }], configHash: "", from: "vortex" });
      assert.equal(back.mods.find((m) => m.id === "mine").fomod.from, "edgedeck");
      assert.equal(back.mods.find((m) => m.id === "old-guess").fomod.from, "inferred");
      assert.equal("structure" in back.mods.find((m) => m.id === "quux-boots").fomod, false);
      assert.throws(() => core.readVortexChoices(path.join(tmp, "nope")), /Vortex/);
    }
  }

  console.log("fomod tests passed");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
