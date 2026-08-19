# How the data model gets from dev to prod

Reference document. Read this first if you are new to the setup, or coming back
to it after a while.

`README.md` next to this file covers commands, credentials and the cutover
runbook. This document explains the *thinking* — why it works this way, what to
expect day to day, and where the sharp edges are.

---

## The problem this solves

Twenty stores custom objects, fields, relations, views and record page layouts as
rows in the `core` schema of whichever database the server points at. They are
created by clicking in the UI, not by writing code.

That means they **do not travel with a Jenkins deploy**. Code goes dev → prod
through git; the data model historically did not go anywhere. Rebuilding it by
hand on prod is slow and drifts immediately.

This package closes that gap.

---

## The one idea that makes it click

Code and data model flow in **opposite directions** relative to dev.

| | Code | Data model |
|---|---|---|
| You create it | in your editor | by clicking in the **dev UI** |
| It reaches dev by | pushing → Jenkins deploys it | it is **already there** — you just made it |
| Dev's role | a deployment target | **the source of truth** |
| It reaches prod by | push → merge → Jenkins | `model:pull` → commit → merge → install |

So `yarn model:pull` is **not** "deploying to dev". It records what you already
built in dev into git, so prod can be given the same thing.

```
   dev UI  ──(model:pull)──>  git  ──(app:install)──>  prod
   source                   record                    copy
```

---

## Why identifiers are the whole trick

Every syncable metadata row in Twenty carries a `universalIdentifier`
(see `SyncableEntity` in the server) — a UUID that is meant to be the same on
every instance — plus an `applicationId` saying who owns it.

The generator copies each identifier from dev verbatim into the committed
source. Because dev and prod end up sharing identifiers per field:

- renaming a field in dev becomes a **rename** on prod, not a drop-and-recreate,
  so the column keeps its data;
- a view that shows "Creation date" still resolves to the right field on prod;
- re-running the sync is idempotent — the server sees "same thing, unchanged".

Get identifiers wrong and every deploy silently destroys and recreates columns.
That is why the generated files must never be hand-edited.

---

## Ownership: why this app is installed on prod only

| Owner | What it owns |
|---|---|
| **Twenty Standard** app | the built-in objects — Company, Person, Note … |
| **Custom** app (one per workspace, hidden) | everything created through that instance's UI |
| **This app** | everything in `src/`, once installed |

On **hosted dev** the model belongs to dev's own *Custom* application, because
that is where you build it by hand. On **prod** it belongs to *this app*.

Installing this app on hosted dev would collide by name with dev's own copies and
force a wipe of the workspace you design in. So:

| Branch | Pipeline | Credentials | Effect on the instance |
|---|---|---|---|
| `dev` | `Jenkinsfile.dev` | none | **none** — builds and typechecks only |
| `main` | `Jenkinsfile.prod` | one prod API key | plans, gates deletions, installs |

The sync is scoped by `applicationId`: the server diffs the manifest against
what **this app** owns on prod. It therefore never touches standard objects it
does not own, and it does delete app-owned things you removed from the manifest.

---

## A full walkthrough

Adding a "Delivery Window" field to **Visit** and showing it in the Visits table.

### 1. You work in dev, exactly as before

Settings → Data model → Visit → add a Text field. Drag the column into the view.
Create a test visit. Check it looks right.

The change is **already live on dev**. Nothing new so far.

### 2. You record it

```bash
cd packages/twenty-apps/floranow/data-model
yarn model:pull
git diff
```

```
 src/objects/visit.object.ts        | +8    the new field
 src/views/visit-all-visits.view.ts | +7    the new column
```

That is your data model as a readable diff. Commit and push to `dev`.

The pre-push hook re-runs the pull and confirms the snapshot still matches dev.

### 3. The dev pipeline runs

Deploys code as always. The data-model job builds the manifest and typechecks it,
and touches no instance. A hand-edited generated file or a broken reference fails
here — before it can reach prod.

### 4. You merge to main

A normal PR. The model is just files in the same commit as the code.

### 5. Prod gets it

```bash
yarn model:plan --remote prod
```
```
Metadata changes: 2 created
  created fieldMetadata deliveryWindow
  created viewField 4c1f…
```

Nothing has changed yet — that is a preview. Then:

```bash
yarn twenty app:publish --private --remote prod
yarn twenty app:install  --remote prod
```

On prod the server runs `ALTER TABLE … ADD COLUMN "deliveryWindow" text` and
inserts one `viewField` row. **Every existing prod visit keeps its data** and
gets an empty Delivery Window.

---

## What each kind of change does on prod

| You do this in dev | Prod result | Risk |
|---|---|---|
| Add a field | column added, existing records keep data | none |
| Add an object | new empty table | none |
| Add or edit a view, reorder columns | view updated | none |
| Rename a label, change icon, add a select option | updated in place | none |
| Rename a field's API name | renamed, data preserved | none |
| Delete a field | column dropped, **values lost forever** | gated |
| Change a field's type | some allowed, some refused by the server | may fail the plan |
| Enter records in dev | **nothing** — records never travel | none |

When a plan contains a delete, `Jenkinsfile.prod` stops, prints exactly what
would be deleted, and refuses to continue until someone re-runs with
`ALLOW_DESTRUCTIVE`. Running by hand, you read the plan before installing.

---

## The thing you must internalise

**`model:pull` captures the entire dev model, not just your change.**

If a colleague is midway through a half-finished object in dev when you pull,
their unfinished work lands in your commit and rides to prod with your field.

1. Always read `git diff` after pulling. Unexpected entries mean someone else
   was working in dev — stop and find out who.
2. Hosted dev is shared. "Experiment freely in dev" now means "experiment
   freely, but the model there is what prod will become."
3. Try risky things, look at them, then undo them in the UI **before** anyone
   pulls.

This is the real cost of snapshot-based syncing. Better known than discovered.

---

## Two rules for the team

1. **Nobody changes the data model in the prod UI.** Prod is generated. A field
   created by hand there is invisible to git and the next install deletes it.
2. **Dev is the drawing board, git is the record.** If it is not in git, it will
   never reach prod.

---

## When something goes wrong

| Situation | What to do |
|---|---|
| Forgot to pull before merging | Prod just misses the change. Pull, commit, deploy again. No damage. |
| Plan shows a delete you did not intend | Someone deleted it in dev. Restore it there, pull again, the delete disappears. |
| Install fails partway | Fix the cause and re-run the install; the sync is idempotent. |
| A bad change is already on prod | Fix it in dev, pull, deploy. Forward is the only path — a dropped column cannot be rolled back, which is why the gate exists. |

---

## What deliberately does not travel

- **Records.** Only the shape of the data, never the data.
- **Roles and role assignments.** Prod has its own users.
- **The four relations every object gets** (`noteTargets`, `taskTargets`,
  `attachments`, `timelineActivities`) — the SDK injects those itself.
- **Auto-created indexes** — foreign key BTREEs and the `searchVector` GIN. Only
  indexes you created yourself are pulled.
- **Active/inactive state**, which the manifest cannot express. Anything
  deactivated in dev arrives active on prod; the pull warns when it sees one.
- **Record page sections on standard objects.** There is no standalone
  `defineViewFieldGroup`, and `createCoreViewFieldGroup` hides
  `universalIdentifier` from the GraphQL schema, so sections added to the Company
  and Opportunity record pages cannot ship *and* cannot be recreated with
  matching identifiers over the API. The affected view fields install fine but
  land ungrouped. They are recorded in
  `src/prerequisites/view-field-groups.json`; `README.md` describes the small
  fork change that would restore grouping.

---

## Map of the package

| Path | What it is |
|---|---|
| `scripts/pull-model.ts` | The generator. Reads dev's Postgres, rewrites `src/` |
| `scripts/wipe-custom-model.ts` | One-time cutover: removes prod's hand-built model |
| `scripts/check-snapshot.sh` | Fails if the committed snapshot ≠ dev |
| `scripts/install-git-hook.sh` | Installs the pre-push hook that runs the above |
| `src/application.config.ts` | App identity — **never change the UUID** |
| `src/roles/default.role.ts` | Required unprivileged app role |
| `src/**` (everything else) | Generated. Wiped and rewritten on every pull |
| `Jenkinsfile.dev` / `Jenkinsfile.prod` | The two pipelines |
| `README.md` | Commands, credentials, cutover runbook |
