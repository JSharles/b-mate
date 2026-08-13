# Plan: the documentary base, the client content, and words that say what they mean

**Branch**: `feat/reference-document-one-call` | **Date**: 2026-08-13

## Why

One route stacked three jobs behind "Étape 1 sur 3": what the documents hold,
the sections the client reads, and what the client sees. Feature 018 removed the
pipeline those steps described, so the page now numbers steps that no longer
exist, in vocabulary that no longer applies — "ce que Diaphane a retenu",
"source", "catégories validées".

The developer has two jobs, on different days. Building a truth they can rely
on, and turning it into something a client reads. They become two screens.

## Routes

| Route | Surface | Holds |
|---|---|---|
| `/projects/:id/documentation` | **Documentation client** | the topics, and the client preview |
| `/projects/:id/documentation/sources` | **Mes documents** | the documents, and the reference document written from them |
| `/projects/:id/documentation/sources/:documentId` | one document | its original, its state, its removal |

**Two levels, from placement rather than from emphasis.** The client
documentation is a card at the top of the project page: it is what the
developer came for. The documents are a row in the project's settings, with
Board, Notion and the preferences — configured once, revisited when they
change. Nothing is dimmed and nothing is lit; the hierarchy is where each thing
sits. Staged layouts, locks and highlighted containers were all tried on paper
and rejected: they make the page a wizard, and this is not a wizard.

**The word is "rubrique"** (EN: topic). "Section" named a region of a screen as
readily as a part of a document, and the developer chose the editorial word.

Removed: `/documentation` and `/documentation/reference`. Nothing is deployed,
so they go rather than redirect.

**"Votre référence" was rejected, and rightly**: it named nothing the developer
would recognise. "Base documentaire" is their own word for it, and the reference
document is what the base produces rather than what the base is called.

**Why documents and the reference document share one page**: a document is added
so that the reference changes. Splitting them would mean navigating to see the
effect of what you just did — and adding a document now writes the document, so
the effect is immediate and worth watching.

## What each page says

Every screen answers two questions and no others: *what am I looking at*, and
*what do I do now*. No product vocabulary the developer never chose — no
"source", no "canonique", no "étape N sur 3", no "catégorie".

### Base documentaire

- **Base documentaire** — "Vos documents d'un côté, le texte que Diaphane en
  tire de l'autre. C'est votre base de travail : votre client ne la lit pas."
- **Vos documents** — "Cahier des charges, comptes rendus, pages Notion : tout
  ce qui décrit le projet. Chaque ajout relance la rédaction."
  - A document's state: *Pris en compte* / *Illisible* / *Retiré*.
    "Intégré à la source" named a table.
- **Le document de référence** — gaps answered in place, corrections in place,
  and what the developer added listed below with the one action that applies it.

### Contenu client

Locked until a reference document is written. A section is composed from that
document, so there is nothing to write before one exists — the API refuses it,
and the screen says so up front instead of letting the developer discover it by
pressing a button that fails. The entry on the project page is shown, not
hidden: knowing the job exists and what it waits for is the point. It is not a
link while locked, so no keyboard user reaches a surface that would turn them
away.

- **Contenu client** — "Vous décidez des chapitres, Diaphane les rédige depuis
  votre base documentaire, et rien ne part sans votre accord."
- **Vos sections** — "Vous nommez une section, vous dites ce qu'elle doit couvrir
  et pour qui. Diaphane la rédige depuis votre document de référence."
- **Aperçu client** — "Exactement ce que votre client voit aujourd'hui. Il ne
  change que quand vous approuvez une section, et jamais à moitié."

### The banner

It reported on a pipeline. It now reports on one thing: what the client can see,
and what is waiting for the developer.

| Was | Becomes |
|---|---|
| Diaphane traite vos documents | Rédaction en cours |
| Le traitement d'un document n'a pas abouti | Une rédaction n'a pas abouti |
| Votre validation est attendue | Une section attend votre relecture |
| La documentation client est à jour | Votre client lit la version à jour |
| Rien n'est visible par le client | Votre client ne voit encore rien |
| # catégories validées sur N | # sections prêtes sur N pour la prochaine publication |

## Removed wording

`Steps.*` in full — stepLabel, title1/2/3, purpose1/2/3. There are no steps.
`Pipeline.description` ("Trois étapes, dans l'ordre.").

## Slices

Both shipped together on 2026-08-13: the wording lives in the components the
first slice rewrites, so splitting them would have meant writing the old words
twice.

## Risks

**The banner loses its home.** It reports project-wide state and half of it
belongs on each page. It goes to the client page, where every state it names is
actionable; the reference page carries its own empty and writing states, which it
already does.
