# b-mate

Monorepo managed with **pnpm workspaces** + **Turborepo**.

## Product

`b-mate` is a client-facing project tracking portal: developers manage projects and tasks, invite non-technical clients by email, clients get a read-only view of progress. Full product spec, data model and rationale, and business rules: **[docs/PRODUCT.md](docs/PRODUCT.md) — read it before implementing any feature.**

The spec is still evolving (early ideation). It contains an explicit "Open decisions" list — DB choice, auth strategy, status enums, etc. **Never resolve one of those unilaterally.** Ask about each one only when the current implementation step actually needs it, not upfront.

## Structure

```
apps/
  web/       Next.js 16 (App Router, Turbopack, Tailwind v4)
  api/       NestJS 11
packages/    Shared code (empty for now — put cross-app code here, e.g. shared tsconfig/eslint config, types, UI kit)
```

## Package manager

- **pnpm only** (pinned to `11.15.0` via `devEngines` in the root `package.json`). Never use `npm` or `yarn` — it will produce a second lockfile and break the workspace.
- Install deps for a specific app from the root: `pnpm --filter web add <pkg>` / `pnpm --filter api add <pkg>`.
- Run `pnpm install` from the repo root only. There must be exactly one `pnpm-lock.yaml`, at the root.

## Commands

All run from the repo root and fan out through Turborepo to every app that defines the script:

| Command        | Does |
|-----------------|------|
| `pnpm dev`      | `turbo run dev` — starts web + api in watch mode |
| `pnpm build`    | `turbo run build` |
| `pnpm lint`     | `turbo run lint` |
| `pnpm test`     | `turbo run test` |

To target a single app: `pnpm --filter web dev` or `pnpm --filter api dev` (or `turbo run build --filter=api`).

## Conventions

- TypeScript strict mode on both apps — don't weaken `tsconfig.json` compiler options to silence an error; fix the type.
- `apps/web`: App Router conventions, components colocated under `app/`. Path alias `@/*` maps to the app root.
- `apps/api`: standard Nest module/controller/service structure. Keep one module per domain concern.
- No shared packages exist yet. Before duplicating code (types, config, UI) between `apps/web` and `apps/api`, check whether it belongs in a new `packages/*` workspace instead.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).

## Gotchas

- `apps/web` and `apps/api` must **not** have their own `pnpm-lock.yaml` or `pnpm-workspace.yaml` — only the root does. If one reappears (e.g. after scaffolding a new app with its own CLI), delete it and re-run `pnpm install` from the root.
- `.turbo/` is cache, safe to delete anytime (`rm -rf .turbo`).
