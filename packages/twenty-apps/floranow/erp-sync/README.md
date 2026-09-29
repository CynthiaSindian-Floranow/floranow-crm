# floranow-erp-sync — Job A · Provisioning

Turns registered leads into CRM Companies. For every **Lead** in stage
**Qualified** that carries a **debtor number**, the tool asks the ERP whether
that customer exists; when it does, it creates the **Company** (plus contact)
in the CRM from the ERP snapshot and flips the lead to **Converted**. Leads
whose debtor number the ERP does not know yet are left untouched and reported.

Design reference: `crm/guides/rollout/Lead-to-Company-Data-Model-and-Flow.html`
(§G, "Job A"). ERP counterpart: `GET /api/integration/customers` (bulk) on the
ERP, branch `feat/crm-customer-snapshot-api`.

## Rules

- **Attach, never duplicate** — a debtor number that already has a Company
  gets the lead linked to it; a second Company is never created.
- **People are redirected, never invented** — the lead's point of contact is
  moved onto the Company; the pipeline never creates Person records. A lead
  without a point of contact gets a warning so the AM adds one by hand.
- **Internal ERP accounts are skipped** — staff/system users are not clients;
  their leads are reported (`INTERNAL`) and left untouched. Customer types
  (retail / reseller / FOB / CIF) all process; `customerType` is recorded as
  data.
- **Only sync-owned fields are written.** CRM-owned fields (owner, tier,
  zone, checklists) are set once at provisioning (defaults: Never Ordered,
  Onboarding, protected, AMBER) and never touched again.
- **Unmappable ERP values are reported, not guessed** — e.g. a payment term
  with no CRM option is left empty and flagged in the run output.
- **No welcome-message automation.** Deliberately out of scope for now.

## Running it

```bash
cd packages/twenty-apps/floranow/erp-sync
yarn install                 # once
cp .env.sample .env          # once — fill in the ERP key
yarn sync:dev                # DRY RUN — prints the plan, writes nothing
yarn sync:dev:apply          # actually provisions and converts
```

The tool **refuses any remote other than dev** for now. When dev is verified,
the prod remote gets enabled deliberately (and scheduling — e.g. a daily
Jenkins cron — is decided then).

Twenty credentials are read from `.env`, falling back to
`../data-model/.env` (same keys: `TWENTY_DEV_URL` / `TWENTY_DEV_API_KEY`).
The ERP key is the value of `FLORANOW_API_SHARED_KEY` on the target ERP.

## Outcomes per lead

| Outcome | Meaning |
|---|---|
| `CREATED` | Company created from the ERP snapshot; lead → Converted |
| `ATTACHED` | Company with that debtor number already existed; lead linked and → Converted |
| `WAITING` | Debtor number not in the ERP yet — lead left untouched (the watchdog case) |
| `INTERNAL` | ERP marks the account internal (staff/system) — lead left untouched |
| `DUPLICATE` | Same debtor number on an earlier lead in this run — needs a human |
| `ERROR` | Request failed; nothing partial is retried automatically |

## Job B — the ongoing mirror (phase 1)

`yarn mirror:dev` / `yarn mirror:dev:apply` refreshes the mirrored commercial
fields (payment term, warehouse, route, category, credit limit, blocked
status, …) on every Company carrying a debtor number, and stamps
`lastSyncAt` — the freshness flag. Only changed fields are written; identity,
name and CRM-owned fields are never touched. Per-company outcomes:
`UPDATED` · `UNCHANGED` (stamp only) · `NOT-IN-ERP` (debtor number vanished —
needs a human) · `INTERNAL` · `ERROR`.

Phase 2 (financial mirror — receivables, revenue buckets, order counts)
needs an aggregates endpoint on the ERP; not built yet.

## Scheduling & triggers

`Jenkinsfile` in this directory defines one parameterized job:

- **Nightly cron** runs Job B (`mirror --apply`) against dev.
- **Build with Parameters** runs Job A on demand (`JOB=sync`).
- **Manual trigger from the CRM** (for the support team): enable
  *Trigger builds remotely* on the Jenkins job with a token, then create a
  Twenty workflow — manual launch, one HTTP-request step:
  `POST https://<jenkins>/job/<job-name>/buildWithParameters?token=<token>&JOB=sync&MODE=apply`.
  Support presses the workflow's Launch button inside the CRM; Jenkins does
  the rest. (Jenkins credentials needed: `twenty-dev-api-key`,
  `erp-dev-api-key`.)

`yarn test` runs the mapping unit tests; `yarn typecheck` type-checks.
