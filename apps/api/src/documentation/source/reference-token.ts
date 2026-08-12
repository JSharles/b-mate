import { z } from 'zod';

// Consolidation used to hand the model raw UUIDs and ask for them back
// verbatim. On a Notion page with 61 observations it returned 60 of them
// perfectly and mistyped one character of the 61st — `…79f40f44ef70` came back
// as `…79f44f44ef70` — which failed the whole consolidation, twice, and left
// the document integrating forever. Copying 36 random characters is not a
// task worth asking of a language model, and the odds of getting every one
// right fall as a project accumulates documents.
//
// So the model never sees an identifier. It sees `o12`, and we hold the map.
// Two or three characters, from a space small enough that a slip lands on a
// token that either does not exist or is obviously the wrong kind.

const OBSERVATION_PREFIX = 'o';
const ITEM_PREFIX = 'i';

export const ObservationRefSchema = z.string().regex(/^o\d{1,5}$/u);
export const ItemRefSchema = z.string().regex(/^i\d{1,5}$/u);

// The prefixes are what make a mix-up loud: an item reference where an
// observation belongs cannot be mistaken for a valid one.
export const OBSERVATION_REF_JSON_SCHEMA = {
  type: 'string',
  pattern: '^o[0-9]{1,5}$',
} as const;
export const ITEM_REF_JSON_SCHEMA = {
  type: 'string',
  pattern: '^i[0-9]{1,5}$',
} as const;

export function observationRef(index: number): string {
  return `${OBSERVATION_PREFIX}${index}`;
}

export function itemRef(index: number): string {
  return `${ITEM_PREFIX}${index}`;
}

/**
 * Turns the references the model answered with back into the identifiers they
 * stand for, refusing any it was never given.
 */
export function resolveRef(
  map: ReadonlyMap<string, string>,
  ref: string,
  what: string,
): string {
  const resolved = map.get(ref);
  if (!resolved) {
    throw new Error(`Consolidation references unknown ${what} ${ref}.`);
  }
  return resolved;
}
