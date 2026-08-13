#!/usr/bin/env node
// specs/015-document-reference-layer research.md Decision 8.
//
// knip cannot see translation keys — they are JSON data, not code symbols — so
// deleting a component silently leaves its strings behind in both catalogues.
// This closes that gap: it fails when a key has no call site, and when the two
// locales disagree about which keys exist.
//
// The match is deliberately loose (does this key name appear as a quoted string
// anywhere in the web source?) rather than trying to resolve namespaces through
// `useTranslations`. Loose in this direction is the safe one: it can miss an
// orphan whose name collides with an unrelated string, but it will not accuse a
// key that is genuinely in use — and a check that cries wolf gets switched off.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const WEB = "apps/web";
const MESSAGES = join(WEB, "messages");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIP_DIRECTORIES = new Set(["node_modules", ".next", "coverage", "messages"]);

function flatten(value, prefix = "") {
  if (typeof value !== "object" || value === null) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    if (SKIP_DIRECTORIES.has(entry)) return [];
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return SOURCE_EXTENSIONS.has(extname(entry)) ? [full] : [];
  });
}

const locales = readdirSync(MESSAGES)
  .filter((file) => file.endsWith(".json"))
  .map((file) => ({
    locale: file.replace(/\.json$/, ""),
    keys: flatten(JSON.parse(readFileSync(join(MESSAGES, file), "utf8"))),
  }));

// Keys assembled at runtime (`t(`q${n}`)`), which no static scan can resolve.
// Listed rather than silently skipped: each entry is a promise that a human
// checked the call site once, and the list is short enough to re-check.
// A key built at runtime has no literal call site to find, so it has to be
// declared here or the check reports it as waste. Each entry names the file
// that builds it — if that file goes, so does the entry.
const DYNAMIC_KEYS = [
  // apps/web/features/landing/components/faq-section.tsx builds `q${n}`/`a${n}`
  // from GROUPS[].questionNumbers.
  /^Landing\.faq\.[qa]\d+$/,
  // The three landing sections index their cards by number.
  /^Landing\.(clients|developers|features)\.card\d+(Title|Description)$/,
  // features-section, how-it-works-section and document-preview all render
  // `t(`${key}Description`)` over a local list of keys.
  /^Landing\.(features|howItWorks)\.\w+Description$/,
  /^Landing\.features\.documentPreview\.\w+Description$/,
  // ai-preview.tsx renders `t(`${key}Label`)`.
  /^Landing\.features\.preview\.\w+Label$/,
  // client-content-page.tsx renders the aggregate's own state values, and
  // documentation-entry-cards.tsx renders its priority on the client card.
  /^Projects\.Documentation\.Client\.(priority|visibility)_\w+$/,
  /^Projects\.Documentation\.Entries\.priority_\w+$/,
  // section-list.tsx derives one state per section from its flags.
  /^Projects\.Documentation\.Sections\.state_\w+$/,
  // section-editor-dialog.tsx maps over DIMENSIONS, building both the label and
  // each option's name from the field it is rendering.
  /^Projects\.Documentation\.Sections\.Editor\.(length|pedagogy|technicalFamiliarity|tone)(Label|_\w+)$/,
  // section-editor-dialog.tsx maps over SECTION_SUGGESTION_IDS from
  // section-suggestions.ts, building `suggestion_<id>_name`/`_instructions`.
  /^Projects\.Documentation\.Sections\.Editor\.suggestion_\w+_(name|instructions)$/,
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const failures = [];

// 1. The two catalogues must describe the same keys. A key added to one locale
//    only is a missing translation that no type system will catch.
const [reference, ...others] = locales;
for (const other of others) {
  const missing = reference.keys.filter((key) => !other.keys.includes(key));
  const extra = other.keys.filter((key) => !reference.keys.includes(key));
  for (const key of missing) {
    failures.push(`${key} — present in ${reference.locale}, missing from ${other.locale}`);
  }
  for (const key of extra) {
    failures.push(`${key} — present in ${other.locale}, missing from ${reference.locale}`);
  }
}

// 2. Every leaf key needs a call site somewhere in the web source.
const haystack = sourceFiles(WEB)
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

for (const key of reference.keys) {
  if (DYNAMIC_KEYS.some((pattern) => pattern.test(key))) continue;

  // `useTranslations("Landing.faq")` then `t("navLabel")`, but also
  // `useTranslations("Landing")` then `t("faq.navLabel")` — the call site can
  // hold any dotted suffix of the full key, so accept all of them.
  const segments = key.split(".");
  const candidates = segments.map((_, index) => segments.slice(index).join("."));
  const found = candidates.some((candidate) =>
    new RegExp(`["'\`]${escapeRegExp(candidate)}["'\`]`).test(haystack),
  );
  if (!found) {
    failures.push(`${key} — no call site`);
  }
}

if (failures.length > 0) {
  console.error(`i18n: ${failures.length} problem(s)\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("\nA key with no call site is waste; a key in one locale only is a gap.");
  process.exit(1);
}

console.log(`i18n: ${reference.keys.length} keys, all used, all locales in agreement`);
