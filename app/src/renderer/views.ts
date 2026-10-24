export interface View {
  name: string;
  empty: string;
}

/** The six top-level views and what each will show once its milestone lands. */
export const VIEWS: readonly View[] = [
  { name: "Catalogue", empty: "Study material discovered from sources that allow it will appear here, ranked by fit for you." },
  { name: "Study", empty: "Pick a downloaded reference to see its arrangement map, techniques and a study task." },
  { name: "Studio", empty: "With Live open, your set and its sound will be mirrored here beside a reference." },
  { name: "Versions", empty: "Add an Ableton project to snapshot every save, name versions and branch ideas." },
  { name: "Lessons", empty: "Lessons written with /lesson in Claude Code will be listed here by skill." },
  { name: "Drills", empty: "Short ear-training warm-ups will appear here." },
];
