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
- **No account-type filtering** — internal / FOB / CIF / reseller are
  processed like everyone else; `customerType` is recorded as data.
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
| `DUPLICATE` | Same debtor number on an earlier lead in this run — needs a human |
| `ERROR` | Request failed; nothing partial is retried automatically |

`yarn test` runs the mapping unit tests; `yarn typecheck` type-checks.
