// The fs EDGEdeck's file work goes through. Electron, which runs VS Code's extension host, makes
// node:fs read every .asar file as a folder, so copying, sizing or deleting one fails ("ENOENT, not
// found in ...\app.asar", or EPERM on the folder that holds it). Mods carry them: REDnode's host has
// resources\app.asar (the owner's test, 2026-11-01). Electron's original-fs is node's own fs, without
// that; plain node (the command line, the MCP server) has no .asar support and uses node:fs.

import * as nodeFs from "node:fs";

function pick(): typeof nodeFs {
  try {
    // A runtime require, kept out of the bundle (esbuild.mjs marks it external).
    return require("original-fs") as typeof nodeFs;
  } catch {
    return nodeFs;
  }
}

const fs = pick();

/** True when original-fs is in use: inside Electron. */
export const electronFs = fs !== nodeFs;

export default fs;
