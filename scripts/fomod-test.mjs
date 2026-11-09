// Tests the FOMOD reader against the fixtures in scripts/fixtures/fomod.
//   node scripts/fomod-test.mjs       after npm run build
import assert from "node:assert/strict";
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

  // familyForDownload: case and slash insensitive
  const dl = path.join(tmp, "downloads", "Some Mod-1-0.zip");
  const m2 = core.addMod(lib, cl.placements, { name: "Dl", source: { type: "nexus", path: dl } });
  assert.equal(core.familyForDownload(lib, dl.toUpperCase().split(path.sep).join("/")).id, m2.id);
  assert.equal(core.familyForDownload(lib, path.join(tmp, "other.zip")), undefined);

  console.log("fomod tests passed");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
