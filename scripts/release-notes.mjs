// Prints the release notes for one version from its section of CHANGELOG.md. The release workflow
// uses it for the GitHub release, and stops before publishing anything when the version has no
// section. The same convention as every Edgemodders repo (REDnode's tools/release/notes.mjs).
//
//   node scripts/release-notes.mjs [version]            markdown for GitHub, with the install line
//   node scripts/release-notes.mjs [version] --nexus    the section's short Nexus summary (see below), for
//                                                       Nexus's changelog field; stops when there is none
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

// The section for GitHub and the stores: without its Nexus summary (below).
const github = [];
for (let i = 0, inBlock = false; i < section.length; i++) {
  if (!inBlock && section[i].trim() === "<!-- nexus") inBlock = true;
  else if (inBlock && section[i].trim() === "-->") inBlock = false;
  else if (!inBlock) github.push(section[i]);
}

if (nexus) {
  // Nexus shows each line of a version's changelog as one entry, as plain text in a small field,
  // and its API cannot edit or delete one once posted. So its lines are a short summary written by
  // hand under the version's heading, in an HTML comment that GitHub, the stores and the docs site hide:
  //
  //   <!-- nexus
  //   New: FOMOD installer: pick a mod's options when you add it
  //   Fixed: A number inside a mod's name is no longer read as its Nexus id
  //   -->
  //
  // The rules are EDGErepo's (README, "Nexus changelogs"), whose nexus.mjs release refuses notes that
  // break them: each line starts with New:, Changed:, Fixed:, Removed:, Other: or Needs:, plain text,
  // at most NEXUS_LINE characters; at most NEXUS_LINES lines with the "Full changelog" link added last.
  const NEXUS_LINE = 120;
  const NEXUS_LINES = 13;
  const open = section.findIndex((line) => line.trim() === "<!-- nexus");
  const close = open < 0 ? -1 : section.findIndex((line, i) => i > open && line.trim() === "-->");
  if (open < 0 || close < 0) {
    console.error(`CHANGELOG.md: the section for ${version} has no Nexus summary. Add one under its heading:

<!-- nexus
New: one short line per change, at most ${NEXUS_LINE} characters
-->`);
    process.exit(1);
  }
  const summary = section.slice(open + 1, close).map((line) => line.trim()).filter(Boolean);
  const wrong = [];
  if (!summary.length) wrong.push("it is empty");
  if (summary.length > NEXUS_LINES - 1) wrong.push(`${summary.length} lines, at most ${NEXUS_LINES - 1} (the link makes ${NEXUS_LINES})`);
  for (const line of summary) {
    if (!/^(New|Changed|Fixed|Removed|Other|Needs): \S/.test(line)) wrong.push(`"${line}" does not start with New:, Changed:, Fixed:, Removed:, Other: or Needs:`);
    if (line.length > NEXUS_LINE) wrong.push(`"${line.slice(0, 50)}..." is ${line.length} characters, at most ${NEXUS_LINE}`);
    if (/`|\*\*|\]\(/.test(line)) wrong.push(`"${line.slice(0, 50)}..." has markdown`);
  }
  if (wrong.length) {
    console.error(`CHANGELOG.md: the Nexus summary for ${version}:\n- ${wrong.join("\n- ")}`);
    process.exit(1);
  }
  write([...summary, "Full changelog: https://edgemodders.github.io/EDGEdeck/changelog.html"].join("\n"));
} else {
  write(`${github.join("\n").trim()}

**Install:** in VS Code, search the Extensions view for EDGEdeck (VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=edgemodders.edgedeck, Open VSX: https://open-vsx.org/extension/edgemodders/edgedeck), or install the .vsix below with Extensions: Install from VSIX. Docs: https://edgemodders.github.io/EDGEdeck/ (changelog: https://edgemodders.github.io/EDGEdeck/changelog.html)`);
}

function write(text) {
  if (out) writeFileSync(out, text + "\n", "utf8");
  else console.log(text);
}
