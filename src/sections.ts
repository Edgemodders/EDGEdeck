// Sections: how the list is grouped. Frameworks and Mods are built in; a user adds sections of
// their own between them and puts mods in. A section holds families, not versions, so a new version
// stays where the old one was. Sections are display only: the order in library.json still decides
// who wins a conflict, and moving a mod within a section moves it past its neighbour there. A page
// group (pageGroups.ts) sits in a section as one: where its first file is, moved as one unit, and its
// files move only among themselves.

import { families, familyKey, type Family } from "./families";
import { placeAbove, saveLibrary, type Library, type ModInfo } from "./library";
import { groupOfFamily, pageGroups, setFamiliesOn, setOrder, type PageGroup } from "./pageGroups";

export const FrameworksSection = "Frameworks";
export const ModsSection = "Mods";

export interface Section {
  name: string;
  /** False for Frameworks and Mods, which cannot be renamed, moved or deleted. */
  user: boolean;
  /** In library order, a group's files together where its first one sits. */
  families: Family[];
  /** The page groups among the families. */
  groups: PageGroup[];
}

function isBuiltIn(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === FrameworksSection.toLowerCase() || n === ModsSection.toLowerCase();
}

/** The section a family sits in: the one it was put in, else Frameworks or Mods by its kinds. */
export function sectionNameOf(lib: Library, fam: Family): string {
  const put = lib.info.sectionOf?.[fam.key];
  if (put === FrameworksSection || put === ModsSection || (put && lib.info.sections?.includes(put))) return put;
  return fam.active.kinds.includes("framework") ? FrameworksSection : ModsSection;
}

/** Every section in display order, each with its families in library order. Frameworks shows only when it has any. */
export function sectionsOf(lib: Library, fams: Family[] = families(lib)): Section[] {
  const names = [FrameworksSection, ...(lib.info.sections ?? []), ModsSection];
  const out: Section[] = names.map((name) => ({ name, user: !isBuiltIn(name), families: [], groups: [] }));
  const byName = new Map(out.map((s) => [s.name, s]));
  const groups = pageGroups(fams);
  for (const f of fams) {
    const g = groupOfFamily(groups, f.key);
    if (g && g.families[0] !== f) continue;
    const sec = byName.get(sectionNameOf(lib, g ? g.families[0] : f))!;
    if (g) {
      sec.families.push(...g.families);
      sec.groups.push(g);
    } else sec.families.push(f);
  }
  return out.filter((s) => s.name !== FrameworksSection || s.families.length);
}

/** What moves as one in a section: a group's families, or one family. */
function unitsOf(sec: Section): Family[][] {
  const out: Family[][] = [];
  const seen = new Set<string>();
  for (const f of sec.families) {
    const g = groupOfFamily(sec.groups, f.key);
    if (!g) out.push([f]);
    else if (!seen.has(g.key)) {
      seen.add(g.key);
      out.push(g.families);
    }
  }
  return out;
}

const idsOf = (unit: Family[]) => new Set(unit.flatMap((f) => f.mods.map((m) => m.id)));

/** Puts every entry of a unit directly above or below another unit's in the order. */
function placeUnit(lib: Library, unit: Family[], target: Family[], below: boolean): void {
  const mine = idsOf(unit);
  const theirs = idsOf(target);
  const order = lib.info.order.filter((id) => !mine.has(id));
  const hits = order.flatMap((id, k) => (theirs.has(id) ? [k] : []));
  const at = below ? (hits.length ? hits[hits.length - 1] + 1 : -1) : (hits[0] ?? -1);
  if (at < 0) return;
  order.splice(at, 0, ...lib.info.order.filter((id) => mine.has(id)));
  setOrder(lib, order);
}

/** Why a name cannot be a new section's, or undefined when it can. */
export function sectionNameProblem(lib: Library, name: string, renaming?: string): string | undefined {
  const n = name.trim();
  if (!n) return "Give the section a name.";
  if (isBuiltIn(n)) return `${n} is already a section.`;
  if ((lib.info.sections ?? []).some((s) => s.toLowerCase() === n.toLowerCase() && s !== renaming)) return `There is already a section called ${n}.`;
  return undefined;
}

export function addSection(lib: Library, name: string): void {
  const problem = sectionNameProblem(lib, name);
  if (problem) throw new Error(problem);
  lib.info.sections = [...(lib.info.sections ?? []), name.trim()];
  saveLibrary(lib);
}

export function renameSection(lib: Library, from: string, to: string): void {
  const problem = sectionNameProblem(lib, to, from);
  if (problem) throw new Error(problem);
  const name = to.trim();
  lib.info.sections = (lib.info.sections ?? []).map((s) => (s === from ? name : s));
  for (const [k, v] of Object.entries(lib.info.sectionOf ?? {})) if (v === from) lib.info.sectionOf![k] = name;
  saveLibrary(lib);
}

/** Deletes a section; its mods go back to Frameworks or Mods. */
export function deleteSection(lib: Library, name: string): void {
  lib.info.sections = (lib.info.sections ?? []).filter((s) => s !== name);
  for (const [k, v] of Object.entries(lib.info.sectionOf ?? {})) if (v === name) delete lib.info.sectionOf![k];
  saveLibrary(lib);
}

/** Moves a user section up or down among the user sections. */
export function moveSection(lib: Library, name: string, delta: -1 | 1): void {
  const list = [...(lib.info.sections ?? [])];
  const i = list.indexOf(name);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  lib.info.sections = list;
  saveLibrary(lib);
}

/**
 * Puts a mod's family in a section. Putting it back where its kinds would put it clears the entry.
 * A file of a page group takes the whole group along.
 */
export function putInSection(lib: Library, mod: ModInfo, name: string): void {
  const key = familyKey(mod);
  const fams = families(lib);
  const unit = groupOfFamily(pageGroups(fams), key)?.families ?? fams.filter((f) => f.key === key);
  const map = { ...(lib.info.sectionOf ?? {}) };
  for (const f of unit.length ? unit : [{ key, active: mod } as Family]) {
    delete map[f.key];
    const natural = f.active.kinds.includes("framework") ? FrameworksSection : ModsSection;
    if (name !== natural) map[f.key] = name;
  }
  lib.info.sectionOf = map;
  saveLibrary(lib);
}

/**
 * Moves a mod past its neighbour in its section: up wins against the mod shown above it, down
 * loses to the mod shown below it. A file of a page group moves past the group's file next to it;
 * any other mod moves past a whole group. Returns false at the edge of the section or group.
 */
export function moveInSection(lib: Library, mod: ModInfo, delta: -1 | 1): boolean {
  const key = familyKey(mod);
  const section = sectionsOf(lib).find((s) => s.families.some((f) => f.key === key));
  if (!section) return false;
  const group = groupOfFamily(section.groups, key);
  if (group) {
    const i = group.families.findIndex((f) => f.key === key);
    const other = group.families[i + delta];
    if (!other) return false;
    const me = group.families[i];
    if (delta < 0) placeAbove(lib, me.active, other.active);
    else placeAbove(lib, other.active, me.active);
    return true;
  }
  return moveUnit(lib, section, (u) => u.some((f) => f.key === key), delta);
}

/** Moves a page group past the mod or group next to it in its section. */
export function moveGroupInSection(lib: Library, groupKey: string, delta: -1 | 1): boolean {
  const section = sectionsOf(lib).find((s) => s.groups.some((g) => g.key === groupKey));
  if (!section) return false;
  return moveUnit(lib, section, (u) => groupOfFamily(section.groups, u[0].key)?.key === groupKey, delta);
}

function moveUnit(lib: Library, section: Section, mine: (u: Family[]) => boolean, delta: -1 | 1): boolean {
  const units = unitsOf(section);
  const i = units.findIndex(mine);
  const other = units[i + delta];
  if (i < 0 || !other) return false;
  if (delta < 0) placeUnit(lib, units[i], other, false);
  else placeUnit(lib, other, units[i], false);
  return true;
}

/**
 * Puts a mod directly above or below another in the order, and in that mod's section. Within a
 * page group its files trade places; a file does not leave its group, and another mod dropped on
 * a group's file goes above or below the whole group.
 */
export function placeNextTo(lib: Library, mod: ModInfo, target: ModInfo, below: boolean): void {
  const fams = families(lib);
  const groups = pageGroups(fams);
  const mine = groupOfFamily(groups, familyKey(mod));
  const theirs = groupOfFamily(groups, familyKey(target));
  if (mine && mine !== theirs) return;
  const targetFam = fams.find((f) => f.key === familyKey(target));
  if (!mine && targetFam) putInSection(lib, mod, sectionNameOf(lib, theirs ? theirs.families[0] : targetFam));
  if (familyKey(mod) === familyKey(target)) return;
  if (theirs && !mine) {
    const fam = fams.find((f) => f.key === familyKey(mod));
    if (fam) placeUnit(lib, [fam], theirs.families, below);
    return;
  }
  const order = lib.info.order.filter((id) => id !== mod.id);
  const t = order.indexOf(target.id);
  if (t < 0) return;
  order.splice(below ? t + 1 : t, 0, mod.id);
  setOrder(lib, order);
}

/** Puts a page group above or below a mod (the whole group, when that mod is in another one), in that mod's section. */
export function placeGroupNextTo(lib: Library, groupKey: string, target: ModInfo, below: boolean): void {
  const fams = families(lib);
  const groups = pageGroups(fams);
  const group = groups.find((g) => g.key === groupKey);
  const theirs = groupOfFamily(groups, familyKey(target));
  const targetFam = fams.find((f) => f.key === familyKey(target));
  if (!group || !targetFam || theirs === group) return;
  putInSection(lib, group.families[0].active, sectionNameOf(lib, theirs ? theirs.families[0] : targetFam));
  placeUnit(lib, group.families, theirs?.families ?? [targetFam], below);
}

/** Turns every mod in a section on or off: on is the version the row shows, off is every version. Returns how many changed. */
export function setSectionOn(lib: Library, name: string, on: boolean): number {
  const section = sectionsOf(lib).find((s) => s.name === name);
  return setFamiliesOn(lib, section?.families ?? [], on);
}
