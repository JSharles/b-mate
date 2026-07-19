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

## Database & environments

- **Local dev**: Postgres runs in Docker (`docker compose up -d postgres`, defined at repo root). `apps/api` connects via Prisma — copy `apps/api/.env.example` to `apps/api/.env` (gitignored) before running anything.
- **Prisma**: schema at `apps/api/prisma/schema.prisma`. `pnpm --filter api prisma:migrate` to create/apply a migration, `pnpm --filter api prisma:studio` to browse data, `pnpm --filter api prisma:generate` to regenerate the client (also runs automatically on `pnpm install` via `postinstall`).
- **Prod**: Railway hosts both `apps/api` and the production Postgres instance. Prod env vars (`DATABASE_URL`, etc.) live in the Railway dashboard, never in a committed file. Migrations are applied with `prisma migrate deploy` (not `migrate dev`), typically as part of the Railway deploy step.
- **Deploying `apps/api`**: `railway.json` at the repo root defines the build/start commands for Railway (Nixpacks, `pnpm --filter api build`, then `prisma migrate deploy` before `start:prod`). This assumes the Railway service's Root Directory stays at the repo root — it needs the root `pnpm-lock.yaml` and `pnpm-workspace.yaml` to resolve the monorepo, it will break if pointed at `apps/api` alone. Actually creating the Railway project/service and wiring `DATABASE_URL` is a manual dashboard step, not automated here — nothing gets provisioned without an explicit go-ahead.
- **`.env` files are per-app, never at the repo root** (`apps/api/.env`, and `apps/web/.env` if/when the frontend needs its own). Each has a committed `.env.example` counterpart — keep it in sync when adding a new env var. The root `.gitignore` ignores `.env*` except `.env.example` (`!.env.example`) — don't remove that negation, it's what lets the example files be committed.

## Conventions

- TypeScript strict mode on both apps — don't weaken `tsconfig.json` compiler options to silence an error; fix the type.
- `apps/web`: App Router conventions, components colocated under `app/`. Path alias `@/*` maps to the app root.
- `apps/api`: standard Nest module/controller/service structure. Keep one module per domain concern.
- **Auth**: hand-rolled, not Passport — `apps/api/src/auth`. Server-side sessions (`Session` table), `httpOnly` cookie, no JWT. To protect a route: `@UseGuards(SessionGuard)` + `@CurrentUser() user: User`. See `docs/PRODUCT.md` § Authentication for why.
- No shared packages exist yet. Before duplicating code (types, config, UI) between `apps/web` and `apps/api`, check whether it belongs in a new `packages/*` workspace instead.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).

## Gotchas

- `apps/web` and `apps/api` must **not** have their own `pnpm-lock.yaml` or `pnpm-workspace.yaml` — only the root does. If one reappears (e.g. after scaffolding a new app with its own CLI), delete it and re-run `pnpm install` from the root.
- `.turbo/` is cache, safe to delete anytime (`rm -rf .turbo`).
- Prisma 7: no `url` in the `datasource` block of `schema.prisma` (validation error if you add one) — the connection string is only passed at runtime via the driver adapter (`@prisma/adapter-pg`, wired in `apps/api/src/prisma/prisma.service.ts`). The generator uses `provider = "prisma-client-js"` (CommonJS output) — the newer `"prisma-client"` generator emits ESM-only code (`import.meta.url`) that breaks under this app's CommonJS setup, don't switch to it without also converting `apps/api` to ESM.
- Docker Desktop must be running before `docker compose up -d postgres` (`open -a Docker` on macOS if it isn't).
