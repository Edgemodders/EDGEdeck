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

  console.log("fomod tests passed");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
