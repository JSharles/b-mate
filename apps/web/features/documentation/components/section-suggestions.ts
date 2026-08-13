// Starting points offered when a contributor creates a section. They are
// interface copy and nothing else: choosing one prefills the form, and the
// section that results is indistinguishable from one typed blank (FR-004b).
//
// The line that must not be crossed: nothing here is ever persisted, and no
// section records which suggestion it came from. The moment a section knows its
// preset, the product has a fixed taxonomy again — recorded, queryable, and
// eventually reasoned about — which is exactly what specs/017 removes.
//
// The real payload of a suggestion is its description, not its title. A
// contributor's instructions are the only expression of what a section should
// hold, and a vague instruction produces a vague section that the system can
// neither detect nor fix. A worked example shown at the moment of writing
// teaches that far better than help text (research Decision 10).
export const SECTION_SUGGESTION_IDS = [
  "overview",
  "howItWorks",
  "planning",
  "audit",
] as const;

// "Other" is deliberately absent. It earned its place as the fourth of a closed
// set — somewhere for whatever the other three could not hold. Offered as a
// suggestion it says nothing, and a contributor who needs a section for
// leftovers is better served naming what those leftovers actually are.
