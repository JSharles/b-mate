// Starting points offered when a contributor creates a section. They are
// interface copy and nothing else: choosing one prefills the form, and the
// section that results is indistinguishable from one typed blank (FR-004b).
//
// The line that must not be crossed: nothing here is ever persisted, and no
// section records which suggestion it came from. The moment a section knows its
// preset, the product has a fixed taxonomy again — recorded, queryable, and
// eventually reasoned about — which is exactly what specs/017 removes.
//
// The real payload of a prose suggestion is its description, not its title. A
// contributor's instructions are the only expression of what a section should
// hold, and a vague instruction produces a vague section that the system can
// neither detect nor fix. A worked example shown at the moment of writing
// teaches that far better than help text (research Decision 10).
//
// The roadmap sits among them rather than below the line. It used to be offered
// apart, next to "write my own title", while the list still carried a prose
// suggestion called "Planning et jalons" — so the developer looking for a
// timeline chose the obvious card and got paragraphs. Two entries meant the
// same thing and the more visible one was the wrong one. There is now one
// answer to "the dates and the order", and it is the frise.
export const SECTION_STARTING_POINTS = [
  { id: "overview", kind: "prose" },
  { id: "howItWorks", kind: "prose" },
  { id: "roadmap", kind: "roadmap" },
  { id: "audit", kind: "prose" },
] as const;

// "Other" is deliberately absent. It earned its place as the fourth of a closed
// set — somewhere for whatever the other three could not hold. Offered as a
// suggestion it says nothing, and a contributor who needs a section for
// leftovers is better served naming what those leftovers actually are.
