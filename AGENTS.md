# b-mate

Monorepo managed with **pnpm workspaces** + **Turborepo**.

## Product

`b-mate` is a client-facing project tracking portal: developers manage projects and tasks, invite non-technical clients by email, clients get a read-only view of progress. Full product spec, data model and rationale, and business rules: **[docs/PRODUCT.md](docs/PRODUCT.md) — read it before implementing any feature.**

The spec is still evolving (early ideation). It contains an explicit "Open decisions" list — DB choice, auth strategy, status enums, etc. **Never resolve one of those unilaterally.** Ask about each one only when the current implementation step actually needs it, not upfront.

## Structure

```
apps/
  web/       Next.js 16 (App Router, Turbopack, Tailwind v4, shadcn/ui)
  api/       NestJS 11
packages/
  schemas/   Zod schemas + inferred types shared across apps (source-only, no build step — see Gotchas)
```

`apps/web` is feature-based: `app/` is routing only (thin pages importing from `features/`), `features/<name>/` holds a feature's components/hooks/api calls, `shared/` holds cross-feature code (API client, shadcn `ui/` components, `useCurrentUser`, etc.). **A feature never imports from another feature** — if two features need the same thing, it belongs in `shared/`. This is why `useCurrentUser` lives in `shared/hooks`, not `features/auth`: almost every feature needs to know who's logged in.

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
| `pnpm test:cov` | `turbo run test:cov` — same tests, with the 80% coverage gate enforced (this is what CI runs) |

To target a single app: `pnpm --filter web dev` or `pnpm --filter api dev` (or `turbo run build --filter=api`).

## Database & environments

- **Local dev**: Postgres runs in Docker (`docker compose up -d postgres`, defined at repo root). `apps/api` connects via Prisma — copy `apps/api/.env.example` to `apps/api/.env` (gitignored) before running anything.
- **Prisma**: schema at `apps/api/prisma/schema.prisma`. `pnpm --filter api prisma:migrate` to create/apply a migration, `pnpm --filter api prisma:studio` to browse data, `pnpm --filter api prisma:generate` to regenerate the client (also runs automatically on `pnpm install` via `postinstall`).
- **Prod**: Railway hosts both `apps/api` and the production Postgres instance. Prod env vars (`DATABASE_URL`, etc.) live in the Railway dashboard, never in a committed file. Migrations are applied with `prisma migrate deploy` (not `migrate dev`), typically as part of the Railway deploy step.
- **Deploying `apps/api`**: `railway.json` at the repo root defines the build/start commands for Railway (Nixpacks, `pnpm --filter api build`, then `prisma migrate deploy` before `start:prod`). This assumes the Railway service's Root Directory stays at the repo root — it needs the root `pnpm-lock.yaml` and `pnpm-workspace.yaml` to resolve the monorepo, it will break if pointed at `apps/api` alone. Actually creating the Railway project/service and wiring `DATABASE_URL` is a manual dashboard step, not automated here — nothing gets provisioned without an explicit go-ahead.
- **`.env` files are per-app, never at the repo root** (`apps/api/.env`, and `apps/web/.env` if/when the frontend needs its own). Each has a committed `.env.example` counterpart — keep it in sync when adding a new env var. The root `.gitignore` ignores `.env*` except `.env.example` (`!.env.example`) — don't remove that negation, it's what lets the example files be committed.

## Testing

- **`apps/api`**: Jest (already there from the Nest scaffold, kept). `pnpm --filter api test` for a quick run, `pnpm --filter api test:cov` to check the coverage gate locally. Mock `PrismaService` via `src/test/prisma-mock.ts` (`createPrismaMock()` / `asPrismaService()`) rather than hitting a real DB — no test in this repo should require Postgres or `DATABASE_URL` to run.
- **`apps/web`**: Vitest + React Testing Library (chosen over Jest for this app specifically — faster, fits Next 16's Turbopack/ESM setup better; `apps/api` keeps Jest since it was already there and worked fine). `pnpm --filter web test:watch` while developing.
- **80% coverage gate on both apps**, enforced by `pnpm test:cov` (root) and by CI (`.github/workflows/ci.yml`, runs on every push to `main` and every PR). Thresholds are configured per app: `apps/api/package.json` → `jest.coverageThreshold`, `apps/web/vitest.config.ts` → `test.coverage.thresholds`. **New code is expected to ship with tests that keep the gate green** — don't bolt tests on at the end of a feature, and don't lower the threshold to make CI pass.
- Both configs exclude framework wiring that isn't worth testing: `apps/api` excludes `*.module.ts` and `main.ts`; `apps/web` excludes `shared/components/ui/**` (shadcn-generated, not hand-authored) and `app/layout.tsx` (fonts/metadata, no logic). Don't chase coverage on files matching those patterns — extend the exclusion list instead if a new one shows up (e.g. a fresh `shadcn add`).
- Server Components (async, using `next/headers`/`next/navigation`) are unit-testable: call the component function directly (`await ProtectedLayout({ children })`) and mock `cookies`/`redirect`/the API call — see `app/(protected)/layout.test.tsx` for the pattern.
- Known debt: request/response types are hand-duplicated between `apps/api` and `apps/web` beyond what `packages/schemas` covers — worth moving more of that into `packages/schemas` once the API surface grows past auth (see `docs/PRODUCT.md`).

## Conventions

- TypeScript strict mode on both apps — don't weaken `tsconfig.json` compiler options to silence an error; fix the type.
- `apps/web`: App Router, feature-based (see Structure above). Path alias `@/*` maps to the app root, so shared code is imported as `@/shared/...`.
- `apps/api`: standard Nest module/controller/service structure. Keep one module per domain concern.
- **Auth**: hand-rolled, not Passport — `apps/api/src/auth`. Server-side sessions (`Session` table), `httpOnly` cookie, no JWT. To protect a route: `@UseGuards(SessionGuard)` + `@CurrentUser() user: User`. See `docs/PRODUCT.md` § Authentication for why.
- `packages/schemas` is the only shared package so far. Before duplicating a type or a validation rule between `apps/web` and `apps/api`, check whether it belongs there instead.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).

## Gotchas

- `apps/web` and `apps/api` must **not** have their own `pnpm-lock.yaml` or `pnpm-workspace.yaml` — only the root does. If one reappears (e.g. after scaffolding a new app with its own CLI), delete it and re-run `pnpm install` from the root.
- `.turbo/` is cache, safe to delete anytime (`rm -rf .turbo`).
- Prisma 7: no `url` in the `datasource` block of `schema.prisma` (validation error if you add one) — the connection string is only passed at runtime via the driver adapter (`@prisma/adapter-pg`, wired in `apps/api/src/prisma/prisma.service.ts`). The generator uses `provider = "prisma-client-js"` (CommonJS output) — the newer `"prisma-client"` generator emits ESM-only code (`import.meta.url`) that breaks under this app's CommonJS setup, don't switch to it without also converting `apps/api` to ESM.
- Docker Desktop must be running before `docker compose up -d postgres` (`open -a Docker` on macOS if it isn't).
- `packages/schemas` ships as TypeScript source, no build step (`main`/`types` point straight at `src/index.ts`). `apps/web` consumes it via Next's `transpilePackages: ["schemas"]` in `next.config.ts`. If `apps/api` ever needs it too, it can't just `require()` it the same way (Node can't run raw `.ts` at runtime) — it would need a real build step added to the package first.
