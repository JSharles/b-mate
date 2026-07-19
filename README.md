# b-mate

Client-facing project tracking portal. Developers manage projects and tasks; non-technical clients get email invites and a read-only view of progress.

> Early stage — MVP scope and open decisions are tracked in [`docs/PRODUCT.md`](docs/PRODUCT.md).

## Tech stack

- **Frontend** — [Next.js](https://nextjs.org) (`apps/web`)
- **Backend** — [NestJS](https://nestjs.com), deployed as a separate service (`apps/api`)
- **Monorepo** — [pnpm workspaces](https://pnpm.io/workspaces) + [Turborepo](https://turborepo.com)

## Prerequisites

- Node.js `>=22`
- [pnpm](https://pnpm.io) `11.15.0` (pinned via `devEngines` in `package.json` — pnpm will offer to install it automatically if missing)

## Getting started

```bash
pnpm install
pnpm dev
```

This starts every app in watch mode (`apps/web` on Next.js's default port, `apps/api` on Nest's default port).

## Project structure

```
apps/
  web/       Next.js app
  api/       NestJS app
packages/    Shared code across apps (empty for now)
docs/        Product spec and design docs
```

## Available scripts

Run from the repo root; each fans out through Turborepo to every app that defines the script.

| Command       | Description                    |
| ------------- | ------------------------------- |
| `pnpm dev`    | Start all apps in watch mode    |
| `pnpm build`  | Build all apps                  |
| `pnpm lint`   | Lint all apps                   |
| `pnpm test`   | Run tests for all apps          |

To target a single app: `pnpm --filter web dev` or `pnpm --filter api dev`.

## Documentation

- [`AGENTS.md`](AGENTS.md) — conventions and workflow for AI coding agents working in this repo
- [`docs/PRODUCT.md`](docs/PRODUCT.md) — product spec, data model, and open decisions

## License

Private — all rights reserved.
