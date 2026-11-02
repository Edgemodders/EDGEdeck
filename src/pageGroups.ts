// Page groups: a Nexus page with two or more of its files in the library (each a family of its own,
// nexusLines.ts) shows as one parent row named after the page, with a row per file under it. The
// group sits in one section and moves as one; its files move only among themselves. A page with
// one file in the library shows as a plain row. The parent's box turns every file off and
// remembers which were on (library.json `groupOn`); ticking it turns those back on, or all.

import { families, type Family } from "./families";
import { saveLibrary, saveMod, type Library } from "./library";
import { fileLabel } from "./nexusLines";

export interface PageGroup {
  /** `page:<Nexus mod id>`. */
  key: string;
  nexusId: number;
  /** The page's name on Nexus, else the first file's name. */
  name: string;
  /** The page's families in library order. */
  families: Family[];
}

export function groupKey(nexusId: number): string {
  return `page:${nexusId}`;
}

/** The groups among the families, in library order of their first family. */
export function pageGroups(fams: Family[]): PageGroup[] {
  const byPage = new Map<number, Family[]>();
  for (const f of fams) if (f.nexusId) byPage.set(f.nexusId, [...(byPage.get(f.nexusId) ?? []), f]);
  const out: PageGroup[] = [];
  for (const [nexusId, members] of byPage) {
    if (members.length < 2) continue;
    const page = members.flatMap((f) => f.mods).find((m) => m.nexus?.name)?.nexus?.name;
    out.push({ key: groupKey(nexusId), nexusId, name: page ?? members[0].name, families: members });
  }
  return out;
}

/** The group a family is in, if any. */
export function groupOfFamily(groups: PageGroup[], key: string): PageGroup | undefined {
  return groups.find((g) => g.families.some((f) => f.key === key));
}

/**
 * A file's name under its group: what tells it from the page's other files. The page's name in
 * front comes off, and a file still named after the page shows its Nexus file name. A name the
 * user gave stays as it is.
 */
export function childName(group: PageGroup, fam: Family): string {
  if (fam.active.renamedFrom !== undefined) return fam.name;
  const prefix = `${group.name}: `;
  if (fam.name.startsWith(prefix) && fam.name.length > prefix.length) return fam.name.slice(prefix.length);
  if (fam.name === group.name) {
    const title = fam.active.source.fileTitle ?? fam.mods.find((m) => m.source.fileTitle)?.source.fileTitle;
    const label = title ? fileLabel(title) : "";
    if (label) return label;
  }
  return fam.name;
}

/** Whether every file of the group is on, some are, or none. */
export function groupState(group: PageGroup, isOn: (f: Family) => boolean = (f) => f.on): "all" | "some" | "none" {
  const n = group.families.filter(isOn).length;
  return n === 0 ? "none" : n === group.families.length ? "all" : "some";
}

/**
 * What a click on a group's box does. With any file on, every file goes off and the ones that were
 * on are remembered. With none on, the remembered ones go back on, or every file when none are
 * remembered. `isOn` reads another loadout than the active one, for the page.
 */
export function groupToggle(lib: Library, group: PageGroup, isOn: (f: Family) => boolean = (f) => f.on): { on: boolean; families: Family[] } {
  const onNow = group.families.filter(isOn);
  if (onNow.length) {
    lib.info.groupOn = { ...(lib.info.groupOn ?? {}), [group.key]: onNow.map((f) => f.key) };
    saveLibrary(lib);
    return { on: false, families: group.families };
  }
  const remembered = group.families.filter((f) => lib.info.groupOn?.[group.key]?.includes(f.key));
  return { on: true, families: remembered.length ? remembered : group.families };
}

/** Turns families on or off: on is the version the row shows, off is every version. Returns how many entries changed. */
export function setFamiliesOn(lib: Library, fams: Family[], on: boolean): number {
  let changed = 0;
  for (const f of fams) {
    for (const m of f.mods) {
      const want = on ? m.enabled || m.id === f.active.id : false;
      if (m.enabled !== want) {
        m.enabled = want;
        saveMod(lib, m);
        changed++;
      }
    }
  }
  return changed;
}

/** Sets the order and sorts the mods to match. */
export function setOrder(lib: Library, order: string[]): void {
  lib.info.order = order;
  const rank = new Map(order.map((id, k) => [id, k]));
  lib.mods.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  saveLibrary(lib);
}

/**
 * Keeps each group's entries together in the order, where its first file sits, so the list shows
 * what wins a conflict: a mod between two files of a page moves below them. Writes only when the
 * order changes; returns whether it did.
 */
export function gatherGroups(lib: Library, fams: Family[] = families(lib)): boolean {
  let order = [...lib.info.order];
  for (const g of pageGroups(fams)) {
    const ids = new Set(g.families.flatMap((f) => f.mods.map((m) => m.id)));
    const actives = new Set(g.families.map((f) => f.active.id));
    const at = order.findIndex((id) => actives.has(id));
    if (at < 0) continue;
    const rest = order.filter((id) => !ids.has(id));
    const before = order.slice(0, at).filter((id) => !ids.has(id)).length;
    order = [...rest.slice(0, before), ...order.filter((id) => ids.has(id)), ...rest.slice(before)];
  }
  if (order.join("\n") === lib.info.order.join("\n")) return false;
  setOrder(lib, order);
  return true;
}
