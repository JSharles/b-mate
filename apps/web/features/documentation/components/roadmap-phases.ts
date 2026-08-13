// The arc nearly every project this product serves runs through, with the
// developer's own work sitting in the middle of it.
//
// They are presets for one control — "add a step" — not rows on the rail. Laid
// out as ghost nodes they looked like the roadmap already had ten steps, which
// was false, and left no way to tell an offer from something the developer had
// written. Inside the button that adds a step, they are exactly what they are.
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
// Six, and no more. Ten of them were tried and read as a wall — the developer
// saw a list of things they had not decided, and could not tell an offer from
// their own content. Contractualisation, reprise de données, bêta and formation
// concern some projects and not others; whoever needs them writes them, which
// is one line of typing rather than four rows everyone else scrolls past.
export const ROADMAP_PHASE_IDS = [
  "framing",
  "design",
  "build",
  "acceptance",
  "launch",
  "aftercare",
] as const;
