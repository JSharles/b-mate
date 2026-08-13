// The arc nearly every project this product serves runs through, with the
// developer's own work sitting in the middle of it. Offered so that an empty
// roadmap is not an empty page.
//
// The line that must not be crossed is the same one the section suggestions
// draw: nothing here is ever persisted, and no milestone records which phase it
// came from. A phase is a name and a starting "when" — the moment a milestone
// knows its preset, the product has a fixed taxonomy again, which is what
// specs/017 removed.
//
// They are also never handed to the model. Giving it an arc to fill is how it
// ends up asserting a "Recette" nobody planned; the developer accepts a phase
// or does not, and whatever they accept is their word (specs/020).
export const ROADMAP_PHASE_IDS = [
  "framing",
  "design",
  "build",
  "acceptance",
  "launch",
  "aftercare",
  // Past this point, phases that concern some projects and not others. They sit
  // after the six because a roadmap that needs them still runs them in this
  // order, and the developer moves whatever they take.
  "contract",
  "migration",
  "beta",
  "training",
] as const;
