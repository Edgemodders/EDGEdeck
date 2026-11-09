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

  console.log("fomod tests passed");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
