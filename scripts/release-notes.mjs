// Prints the release notes for one version from its section of CHANGELOG.md. The publish workflow
// uses it for the GitHub release, and stops before publishing anything when the version has no
// section. The same convention as every Edgemodders repo (REDnode's tools/release/notes.mjs).
//
//   node scripts/release-notes.mjs [version]            markdown for GitHub, with the install line
//   node scripts/release-notes.mjs [version] --nexus    plain lines for Nexus's changelog field
//   --out <file>                                        writes the notes to a file (UTF-8)
//
// The version defaults to package.json's. npm run release:notes runs it.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const nexus = args.includes("--nexus");
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
const version = args.find((a) => !a.startsWith("--")) ?? JSON.parse(readFileSync(root + "package.json", "utf8")).version;
const lines = readFileSync(root + "CHANGELOG.md", "utf8").split(/\r?\n/);

// "## 0.28.0" or "## 0.28.0 (2026-10-21)"
const heading = new RegExp(`^## ${version.replace(/\./g, "\\.")}(\\s|$)`);
const start = lines.findIndex((line) => heading.test(line));
if (start < 0) {
  console.error(`CHANGELOG.md has no section for ${version}: rename Unreleased to "## ${version} (date)" first`);
  process.exit(1);
}
let end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
if (end < 0) end = lines.length;
const section = lines.slice(start + 1, end);
if (!section.some((line) => line.trim())) {
  console.error(`CHANGELOG.md: the section for ${version} is empty`);
  process.exit(1);
}

if (nexus) {
  // Nexus's changelog takes one plain line per change: no markdown, links as "text (url)".
  const plain = (text) =>
    text
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
  const result = [];
  let group = "";
  for (const line of section) {
    const groupHeading = line.match(/^\*\*(.+)\*\*$/);
    if (groupHeading) group = groupHeading[1];
    else if (line.startsWith("- ")) result.push((group ? `${group}: ` : "") + plain(line.slice(2)));
    else if (line.trim()) result.push(plain(line.trim()));
  }
  write(result.join("\n"));
} else {
  write(`${section.join("\n").trim()}

**Install:** in VS Code, search the Extensions view for EDGEdeck (VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=edgemodders.edgedeck, Open VSX: https://open-vsx.org/extension/edgemodders/edgedeck), or install the .vsix below with Extensions: Install from VSIX. Docs: https://edgemodders.github.io/EDGEdeck/ (changelog: https://edgemodders.github.io/EDGEdeck/changelog.html)`);
}

function write(text) {
  if (out) writeFileSync(out, text + "\n", "utf8");
  else console.log(text);
}
