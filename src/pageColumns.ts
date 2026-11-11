// The mods page's columns. The box, the mod's name and its action buttons always show; the others
// are listed here and each player turns them on or off with the page's Columns button. A column the
// player never chose starts as `on` says: the columns from before the button start on, a new one
// starts off, so adding a column never crowds the page (design doc, The UI, Columns). The choices
// live in globalState under PageColumnsKey, outside the library, like folded sections.

export const PageColumnsKey = "edgedeck.pageColumns";

/** The page's sorts, by the webview state's flag that turns each on. */
export type Sort = "bySize" | "byDate";

export interface PageColumn {
  /** Kept in the player's choices and used as the cell's class (`col-<id>`): never rename one. */
  id: string;
  /** The heading over the column. */
  heading: string;
  /** The name in the Columns list, in plain words. */
  label: string;
  /** Shown for a player who never chose. */
  on: boolean;
  /** The page's sort that orders by this column: the column shows while that sort is on. */
  sort?: Sort;
}

/** The columns between the mod's name and its actions, in order. */
export const PageColumns: PageColumn[] = [
  { id: "ver", heading: "Ver", label: "Version", on: true },
  { id: "kind", heading: "Kind", label: "Kind", on: true },
  { id: "size", heading: "Size", label: "Size", on: true, sort: "bySize" },
  { id: "updated", heading: "Updated", label: "Updated on Nexus", on: false, sort: "byDate" },
  { id: "status", heading: "Status", label: "Status", on: true },
];

/** The player's choices, by column id; a column missing from them starts as its `on` says. */
export type ColumnChoices = Record<string, boolean>;

/** Whether a column shows: the player's choice, else its default; always while its sort is on. */
export function columnShown(col: PageColumn, choices: ColumnChoices, sorts: Partial<Record<Sort, boolean>> = {}): boolean {
  if (col.sort && sorts[col.sort]) return true;
  return choices[col.id] ?? col.on;
}

/** The ids of the columns that show, in order. */
export function shownColumns(choices: ColumnChoices, sorts: Partial<Record<Sort, boolean>> = {}): string[] {
  return PageColumns.filter((c) => columnShown(c, choices, sorts)).map((c) => c.id);
}

/** Only known column ids with true or false: what the page sends is kept as it is otherwise. */
export function cleanChoices(input: unknown): ColumnChoices {
  const out: ColumnChoices = {};
  if (!input || typeof input !== "object") return out;
  for (const c of PageColumns) {
    const v = (input as Record<string, unknown>)[c.id];
    if (typeof v === "boolean") out[c.id] = v;
  }
  return out;
}
