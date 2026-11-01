// Starts a real VS Code (downloaded once by @vscode/test-electron) with EDGEdeck loaded from this
// folder, a scratch library and a fake game folder, and runs src/uiTest.ts inside it.
//   npm run test:ui            after npm run build
import { runTests } from "@vscode/test-electron";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
// Set when this runs under a VS Code extension (an assistant in VS Code, say); the test VS Code would start as plain Node.
delete process.env.ELECTRON_RUN_AS_NODE;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edgedeck-ui-"));
const game = path.join(tmp, "game");
const lib = path.join(tmp, "lib");
fs.mkdirSync(path.join(game, "bin", "x64"), { recursive: true });
fs.writeFileSync(path.join(game, "bin", "x64", "Cyberpunk2077.exe"), "not really");
fs.mkdirSync(path.join(tmp, "workspace"), { recursive: true });

// A downloaded VS Code registers itself for vscode:// links when it starts, and the links (Nexus
// downloads through EDGEdeck among them) would go to the test copy from then on: put it back after.
const protocolKey = "HKCU\\Software\\Classes\\vscode\\shell\\open\\command";
const readProtocol = () => /REG_SZ\s+(.+)$/m.exec(spawnSync("reg", ["query", protocolKey, "/ve"], { encoding: "utf8" }).stdout ?? "")?.[1].trim();
const protocolBefore = readProtocol();

try {
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, "dist", "uiTest.js"),
    launchArgs: [path.join(tmp, "workspace"), "--disable-extensions", "--disable-workspace-trust", "--disable-gpu"],
    extensionTestsEnv: { EDGEDECK_TEST_LIB: lib, EDGEDECK_TEST_GAME: game },
  });
  console.log("ui test: passed");
} catch (err) {
  console.error("ui test: failed", err);
  process.exitCode = 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  if (protocolBefore && readProtocol() !== protocolBefore) {
    spawnSync("reg", ["add", protocolKey, "/ve", "/d", protocolBefore, "/f"]);
    console.log("ui test: gave vscode:// links back to " + protocolBefore);
  }
}
