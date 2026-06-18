# Floranow CRM

Floranow CRM is a self-hosted customer relationship management system built on top of
[Twenty](https://github.com/twentyhq/twenty), the open-source CRM. This repository is a
fork that we run, customize, and deploy on our own infrastructure (AWS).

This README is the single source of truth for two audiences:

- **Developers** who write and test features locally — see [Part 1: Using & developing the tool](#part-1--using--developing-the-tool).
- **DevOps** who build, ship, and run it in production — see [Part 2: Deploying for production (DevOps)](#part-2--deploying-for-production-devops).

> This is a fork of upstream Twenty. The `upstream` git remote points at
> `https://github.com/twentyhq/twenty.git`; `origin` is our Floranow repo. Pull upstream
> changes deliberately, never force-push over our `dev`/`main` branches.

---

## Table of contents

- [Architecture at a glance](#architecture-at-a-glance)
- [Repository layout](#repository-layout)
- [Part 1: Using & developing the tool](#part-1--using--developing-the-tool)
  - [Prerequisites](#prerequisites)
  - [First-time setup](#first-time-setup)
  - [Environment variables](#environment-variables)
  - [Running the stack](#running-the-stack)
  - [Logging in](#logging-in)
  - [Day-to-day development](#day-to-day-development)
  - [Quality gates (run before every commit)](#quality-gates-run-before-every-commit)
  - [Database & migrations](#database--migrations)
- [Part 2: Deploying for production (DevOps)](#part-2--deploying-for-production-devops)
  - [What gets deployed](#what-gets-deployed)
  - [Required infrastructure](#required-infrastructure)
  - [Secrets & configuration](#secrets--configuration)
  - [Build the Docker image](#build-the-docker-image)
  - [Run the containers](#run-the-containers)
  - [Database migrations in production](#database-migrations-in-production)
  - [Health checks & smoke test](#health-checks--smoke-test)
  - [CI/CD pipeline (GitHub → Jenkins → AWS)](#cicd-pipeline-github--jenkins--aws)
  - [Upgrades & rollback](#upgrades--rollback)
- [Troubleshooting](#troubleshooting)
- [Stack](#stack)

---

## Architecture at a glance

The application is made of **three runtime processes** plus **two stateful backing services**:

| Component | What it is | Port | Notes |
|-----------|-----------|------|-------|
| **Server** | NestJS API + GraphQL (`twenty-server`) | `3000` | Serves the API; also runs DB migrations on boot unless disabled |
| **Worker** | Background job processor (BullMQ, same image as server) | — | Processes async jobs (emails, imports, automations). **Must run in every environment.** |
| **Frontend** | React + Vite SPA (`twenty-front`) | `3001` (dev) | Bundled into the server image for production; talks to the server API |
| **PostgreSQL** | Primary datastore (all permanent data) | `5432` | Local Docker in dev, **AWS RDS** in prod |
| **Redis** | Queues, cache, sessions (ephemeral) | `6379` | Local Docker in dev, **AWS ElastiCache** in prod. Losing it = re-login + cache rebuild, no permanent data loss |

Same code runs in every environment. **Only environment variables differ** between dev,
staging, and prod.

## Repository layout

```
packages/
├── twenty-front/      # React frontend (Vite, Jotai, Linaria, Lingui)
├── twenty-server/     # NestJS backend API + GraphQL + worker entrypoint
├── twenty-ui/         # Shared UI component library
├── twenty-shared/     # Shared types & utilities (built first)
├── twenty-emails/     # Transactional email templates (React Email)
├── twenty-docker/     # Dockerfiles & docker-compose for prod + dev backing services
│   ├── twenty/Dockerfile      # <- production image DevOps builds
│   ├── docker-compose.yml     # production-style full stack
│   ├── docker-compose.dev.yml # local Postgres + Redis only
│   └── .env.example           # production env template
├── twenty-website/    # Marketing site (not deployed with the app)
└── twenty-e2e-testing/# Playwright E2E tests
```

---

# Part 1 — Using & developing the tool

This part is for engineers writing and testing CRM features.

## Prerequisites

- **Node.js** ≥ 22 and **Yarn 4** (the repo pins the Yarn version via `packageManager`)
- **Docker Desktop** (for local Postgres + Redis; you can also use locally installed services)
- **Git**

## First-time setup

A single script provisions everything (Postgres + Redis, databases, `.env` files, and the
initial schema migration). It is idempotent — safe to run repeatedly.

```bash
yarn install
bash packages/twenty-utils/setup-dev-env.sh
```

Useful flags:

| Flag | Effect |
|------|--------|
| `--docker` | Force Docker mode (uses `packages/twenty-docker/docker-compose.dev.yml`) |
| `--down` | Stop the backing services |
| `--reset` | Wipe data and start fresh |

> Skip the setup script for read-only tasks (code review, docs) — it's only needed when you
> actually run the app.

## Environment variables

Configuration lives in per-package `.env` files. **These are git-ignored and never committed.**
Copy the templates and fill them in:

```bash
cp packages/twenty-server/.env.example packages/twenty-server/.env
cp packages/twenty-front/.env.example  packages/twenty-front/.env
```

Key server variables for local development:

| Variable | Example (dev) | Purpose |
|----------|---------------|---------|
| `NODE_ENV` | `development` | Runtime mode |
| `PG_DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/default` | Postgres connection (point at RDS if using a shared dev DB) |
| `PG_SSL_ALLOW_SELF_SIGNED` | `true` | Needed when connecting to RDS with its default cert |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` | **Must stay constant** for a given database, or existing encrypted data becomes unreadable |
| `APP_SECRET` | random string | Signs sessions/tokens; changing it logs everyone out |
| `SERVER_URL` / `FRONTEND_URL` | `http://localhost:3000` / `http://localhost:3001` | Used for CORS and links |
| `SIGN_IN_PREFILLED` | `true` | Pre-fills the demo login in dev only |

> If you point a dev environment at an existing database, `ENCRYPTION_KEY` **must match** the
> key that originally encrypted that data, otherwise encrypted columns won't decrypt.

## Running the stack

**Option A — one command (recommended):**

```bash
yarn start
```

Starts frontend + backend + worker together.

**Option B — run each process in its own terminal** (handy when iterating on one layer):

```bash
npx nx start twenty-front          # Frontend dev server (http://localhost:3001)
npx nx start twenty-server         # Backend API     (http://localhost:3000)
npx nx run twenty-server:worker    # Background worker
```

> **Note on backend boot time:** the server buffers logs and flushes them at the *end* of
> initialization, which can take ~60–90s on Windows. A quiet terminal during boot is normal —
> it is not hung. The server is ready when `http://localhost:3000/healthz` returns `200`.

## Logging in

Open `http://localhost:3001`, click **Continue with Email**, and use the pre-filled demo
credentials (enabled by `SIGN_IN_PREFILLED=true`).

## Day-to-day development

- **Functional components & named exports only**; strict TypeScript (no `any`).
- Prefer **event handlers over `useEffect`** for state updates; unidirectional data flow.
- Use shared helpers from `twenty-shared` (`isDefined`, `isNonEmptyString`, `isNonEmptyArray`).
- After changing the GraphQL schema, regenerate types:

  ```bash
  npx nx run twenty-front:graphql:generate
  npx nx run twenty-front:graphql:generate --configuration=metadata
  ```

See `CLAUDE.md` and `.cursor/rules/` for the full conventions.

## Quality gates (run before every commit)

```bash
# Lint only what changed vs main (fastest)
npx nx lint:diff-with-main twenty-front
npx nx lint:diff-with-main twenty-server
# Auto-fix:
npx nx lint:diff-with-main twenty-front --configuration=fix

# Type checking
npx nx typecheck twenty-front
npx nx typecheck twenty-server

# Tests (prefer a single file while iterating)
cd packages/twenty-server && npx jest "pattern-or-filename"
npx nx test twenty-front
npx nx test twenty-server
```

## Database & migrations

- PostgreSQL is the primary database; Redis is cache/queues only.
- When you change an entity file, generate an **instance command** (migration):

  ```bash
  npx nx run twenty-server:database:migrate:generate --name <name> --type <fast|slow>
  ```

  `fast` = schema-only changes; `slow` = adds a data-backfill step.
- Always include both `up` and `down` logic. **Never** delete or rewrite committed
  `up`/`down` logic.
- Apply migrations locally:

  ```bash
  npx nx run twenty-server:database:migrate:prod
  ```

- Reset the local database when needed: `npx nx database:reset twenty-server`.

Full details: `packages/twenty-server/docs/UPGRADE_COMMANDS.md`.

---

# Part 2 — Deploying for production (DevOps)

This part is the operational runbook for shipping Floranow CRM to AWS. The app code is in
this repo; **infrastructure (RDS, ElastiCache, S3, networking) is provisioned separately** and
supplied to the app through environment variables.

## What gets deployed

A **single Docker image** (built from `packages/twenty-docker/twenty/Dockerfile`) runs as
**two containers from the same image**:

1. **server** — the API + bundled frontend (listens on `3000`)
2. **worker** — background jobs (`command: ["yarn", "worker:prod"]`)

There is **no separate frontend container in production** — the frontend is built into the
server image and served by it.

## Required infrastructure

| Service | Production target | Notes |
|---------|-------------------|-------|
| PostgreSQL | **AWS RDS** (Postgres 16) | Holds all permanent data. Backups/PITR are RDS's responsibility |
| Redis | **AWS ElastiCache** | VPC-internal only (not publicly reachable). Ephemeral — no backup required |
| Object storage | **AWS S3** (optional) | Set `STORAGE_TYPE=s3` for attachments; otherwise local volume |
| Compute | ECS / EC2 / k8s | Runs the two containers; must reach RDS and ElastiCache within the VPC |

The **worker must always run** alongside the server, or background jobs (emails, imports,
automations) silently never execute.

## Secrets & configuration

**Nothing secret is committed to this repo.** All secrets are injected at deploy time
(AWS Secrets Manager / SSM Parameter Store / Jenkins credentials).

Use `packages/twenty-docker/.env.example` as the template. Production values:

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVER_URL` | ✅ | Public URL of the app, e.g. `https://crm.floranow.com` |
| `PG_DATABASE_URL` | ✅ | Full RDS connection string (or the `PG_DATABASE_*` parts) |
| `REDIS_URL` | ✅ | ElastiCache endpoint, e.g. `redis://my-cluster.xxxx.cache.amazonaws.com:6379` |
| `ENCRYPTION_KEY` | ✅ | `openssl rand -base64 32`. **Constant for the life of the DB.** Store in Secrets Manager |
| `FALLBACK_ENCRYPTION_KEY` |  | Set to the previous key only during a key rotation |
| `APP_SECRET` |  | Legacy; only for instances predating `ENCRYPTION_KEY` |
| `STORAGE_TYPE` | ✅ | `local` or `s3` |
| `STORAGE_S3_REGION` / `STORAGE_S3_NAME` / `STORAGE_S3_ENDPOINT` | if S3 | S3 bucket configuration |
| `DISABLE_DB_MIGRATIONS` |  | `true` on the **worker** (server runs migrations) |
| `DISABLE_CRON_JOBS_REGISTRATION` |  | `true` on the **worker** |

> **Critical:** back up `ENCRYPTION_KEY` securely. If it is lost, encrypted data in RDS cannot
> be recovered. If it changes without a fallback, existing encrypted columns become unreadable.

## Build the Docker image

```bash
docker build \
  -f packages/twenty-docker/twenty/Dockerfile \
  -t <registry>/floranow-crm:<tag> \
  .
```

Build from the **repository root** (the Dockerfile expects the full monorepo as context). It
builds `twenty-shared`, then `twenty-server` and `twenty-front`, into one production image.
Push the tagged image to your registry (ECR):

```bash
docker push <registry>/floranow-crm:<tag>
```

## Run the containers

`packages/twenty-docker/docker-compose.yml` is a production-style reference for the full stack
(server, worker, and — for non-AWS setups — bundled Postgres/Redis). In AWS you typically
**drop the `db` and `redis` services** and point `PG_DATABASE_URL` / `REDIS_URL` at RDS and
ElastiCache.

```bash
cd packages/twenty-docker
# Provide the env file out-of-band (never committed):
docker compose --env-file ./.env.prod up -d server worker
```

> Local-only override files (`docker-compose.override.yml`, any `*.override.yml`) are
> git-ignored on purpose — they hold environment-specific secrets and must **not** ship to
> production. Production config comes from the deploy pipeline.

## Database migrations in production

- The **server** container runs pending migrations automatically on boot (unless
  `DISABLE_DB_MIGRATIONS=true`).
- The **worker** must have `DISABLE_DB_MIGRATIONS=true` and
  `DISABLE_CRON_JOBS_REGISTRATION=true` so it doesn't double-run them.
- For controlled rollouts, set `DISABLE_DB_MIGRATIONS=true` on the server too and run the
  migration as an explicit pipeline step before starting traffic.

## Health checks & smoke test

The server exposes a health endpoint used by the compose/orchestrator health check:

```bash
curl --fail http://localhost:3000/healthz   # expect HTTP 200
```

Point your load balancer / ECS health check at `/healthz`. After deploy, smoke-test by
loading `SERVER_URL` in a browser and logging in.

## CI/CD pipeline (GitHub → Jenkins → AWS)

Typical flow for this repo:

1. **GitHub** — developers merge into `dev` (and later `main`). This repo's `origin` is the
   Floranow GitHub repo; `upstream` is Twenty.
2. **Jenkins** — pipeline triggers on push/merge:
   - `yarn install`
   - lint + typecheck + tests (the quality gates above)
   - `docker build` the production image (`packages/twenty-docker/twenty/Dockerfile`)
   - push the image to **ECR** with an immutable tag (e.g. the git SHA)
3. **AWS** — deploy the new image tag to ECS/EC2/k8s:
   - inject env vars/secrets from **Secrets Manager / SSM**
   - run DB migrations (server boot or an explicit step)
   - roll the **server** and **worker** services
   - verify `/healthz`

Redis at this stage is **infrastructure, not code**: ElastiCache is provisioned once by
DevOps, and the app simply reads `REDIS_URL` from the environment. No application change is
needed to "add Redis" — only the env var.

## Upgrades & rollback

- **Upgrade:** build a new image tag, run migrations, roll the services. Keep migrations
  backward-compatible so the old image can run briefly alongside the new schema.
- **Rollback:** redeploy the previous image tag. Note that an `up` migration may not be safely
  reversible with data; prefer forward-fixes. Never hand-edit committed migration logic.
- **Encryption key rotation:** set the old key as `FALLBACK_ENCRYPTION_KEY` and the new key as
  `ENCRYPTION_KEY`, deploy, let data re-encrypt, then remove the fallback.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Backend "hangs" with no logs on boot | Normal — logs flush at the end of init (~60–90s). Wait for `/healthz` = 200 |
| `/healthz` never returns 200 | Server can't reach RDS or Redis — check `PG_DATABASE_URL` / `REDIS_URL` and VPC/security groups |
| Encrypted fields unreadable / decrypt errors | `ENCRYPTION_KEY` differs from the one that wrote the data — restore the correct key |
| Everyone logged out after deploy | `APP_SECRET` changed — expected; users simply log in again |
| Background jobs (emails/imports) never run | The **worker** isn't running, or its `REDIS_URL` is wrong |
| SSL error connecting to RDS | Set `PG_SSL_ALLOW_SELF_SIGNED=true` (or supply the RDS CA bundle) |
| Frontend loads but API calls fail with CORS errors | `SERVER_URL` / `FRONTEND_URL` mismatch with the actual origin |

---

## Stack

- **TypeScript**, managed as an **Nx** monorepo with **Yarn 4**
- **Backend:** NestJS, TypeORM, GraphQL, BullMQ, PostgreSQL, Redis
- **Frontend:** React 18, Vite, Jotai, Linaria, Lingui

---

> Built on [Twenty](https://github.com/twentyhq/twenty) (AGPL-licensed open-source CRM).
> Upstream documentation: <https://docs.twenty.com>. This fork is maintained by Floranow for
> internal self-hosted use.
