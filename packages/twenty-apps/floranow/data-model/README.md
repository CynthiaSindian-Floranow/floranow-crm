# Floranow Data Model

The custom data model — objects, fields, relations, views, record page fields,
navigation entries, unique indexes — as code.

You still design in the **dev** UI. This package snapshots what you built into
git, and Jenkins replays it onto **prod**. Prod is never dropped: the server
compares the snapshot against what this app already owns there and creates,
updates or deletes only the difference.

> **New here, or coming back after a while? Read [WORKFLOW.md](./WORKFLOW.md)
> first.** It explains how a change travels from dev to prod, what each kind of
> change does on prod, and the pitfalls. This file is the command reference.

## The loop

The data model follows the same path as the code: `dev` branch → hosted dev,
`main` branch → prod.

```
1. change something in the dev UI       (new object / field / view / layout)
2. yarn model:pull                      regenerate src/ from the dev database
3. git diff                             review the change to your data model
4. commit to the dev branch
      → Jenkinsfile.dev  checks the snapshot matches dev, builds, previews prod
5. merge dev → main
      → Jenkinsfile.prod plans against prod, gates deletions, installs
```

### This app is installed on prod only — never on hosted dev

Hosted dev is where you author the model by hand, so its objects belong to dev's
own hidden "Custom" application. Installing this app there would collide with
them by name and force you to wipe the workspace you design in.

So the two pipelines do different things:

| Branch | Pipeline | Credentials | What it does to the instance |
|---|---|---|---|
| `dev` | `Jenkinsfile.dev` | none | **nothing** — builds and typechecks the snapshot |
| `main` | `Jenkinsfile.prod` | one prod API key | plans, gates deletions, then installs |

The prod job deliberately does **not** re-pull from dev. It deploys the snapshot
that was reviewed and merged, not whatever is in dev at that moment.

### Ordering against the code deploy

Run the model install **after** the server code deploy of the same commit — the
install talks to the running prod server. Append the `Jenkinsfile.prod` stages to
the end of your existing prod pipeline, or trigger it downstream on success.

When you upgrade the server, bump `twenty-sdk` in this package's `package.json`
to match; the CLI refuses to sync across a major version mismatch.

## Security model

The deploy path holds exactly **one** secret, and it cannot read a single
customer record.

| Where | Credential | What it can do |
|---|---|---|
| Developer machine | dev Postgres read-only role | read the metadata tables, nothing else |
| `dev` branch pipeline | **none** | build and typecheck the committed snapshot |
| `main` branch pipeline | prod API key, `APPLICATIONS` flag only | publish and install this app |

The dev pipeline deliberately needs no secrets, so nothing has to be requested
from DevOps to start using this. The "did someone change dev without
committing?" check runs on your machine instead, as a pre-push hook.

`app:install` and the sync mutations are guarded by
`SettingsPermissionGuard(PermissionFlagType.APPLICATIONS)`. So create a dedicated
**Deployer** role on prod with the `APPLICATIONS` permission flag and nothing
else — `canReadAllObjectRecords: false` — and issue the CI API key against it.
A workspace admin key would work too, and is exactly what you do not want in CI.

The wipe script is the one exception: it needs `DATA_MODEL` because it deletes
objects and fields. Run it by hand at cutover with a temporary key, then revoke
that key. It is never used again and must never live in Jenkins.

### The read-only database role

`model:pull` reads metadata tables only. Grant it nothing else — column-level on
`workspace`, so it cannot even read workspace settings:

```sql
CREATE ROLE twenty_model_reader LOGIN PASSWORD '<strong-password>';

GRANT USAGE ON SCHEMA core TO twenty_model_reader;

GRANT SELECT (id, "displayName", "workspaceCustomApplicationId")
  ON core.workspace TO twenty_model_reader;

GRANT SELECT ON
  core."objectMetadata", core."fieldMetadata",
  core.view, core."viewField", core."viewFilter", core."viewFilterGroup",
  core."viewSort", core."viewGroup", core."viewFieldGroup",
  core."pageLayout", core."pageLayoutTab", core."pageLayoutWidget",
  core."navigationMenuItem", core."indexMetadata", core."indexFieldMetadata"
TO twenty_model_reader;
```

This role cannot see the `workspace_*` schemas, which is where every customer
record lives. That is narrower than any API key could be.

## Cutover runbook — do this once

1. **Back up the prod database.** Steps 3 and 4 drop tables.
2. `yarn install` in this directory, commit the lockfile.
3. Preview the wipe — changes nothing:
   ```bash
   TWENTY_TARGET_URL=https://prod TWENTY_TARGET_API_KEY=<temp admin key> yarn model:wipe
   ```
   Read the list. It should be prod's hand-built objects and custom fields, and
   nothing you did not expect.
4. Apply it: same command with `--apply --yes`. Re-run without flags to confirm
   it now reports nothing to do.
5. Install the app:
   ```bash
   yarn twenty app:publish --private --remote prod
   yarn twenty app:install  --remote prod
   ```
6. Create the three record page sections from
   `src/prerequisites/view-field-groups.json` (see below), then re-run step 5 so
   the fields attach to them.
7. **Revoke the temporary admin key.** From here on prod only ever sees the
   `APPLICATIONS`-scoped deploy key.

## Local setup — once per clone

```bash
cd packages/twenty-apps/floranow/data-model
yarn install

# catches a forgotten `model:pull` before your push reaches Jenkins
bash scripts/install-git-hook.sh
```

Put the dev database URL in your shell profile so the hook and `model:pull` can
use it. Use the read-only role below, not the superuser credential that is
sitting in `packages/twenty-server/.env`:

```bash
export TWENTY_DEV_DATABASE_URL='postgres://twenty_model_reader:...@floranow-dev2.<...>.rds.amazonaws.com:5432/crm_db_dev'
```

The hook is a no-op when that variable is unset, so it never blocks teammates
who do not touch the data model. Bypass it once with `SKIP_MODEL_CHECK=1 git push`.

### Turning the check on in CI later

If DevOps confirms the Jenkins agent can reach the dev database, ask for the
read-only role's URL as a Jenkins secret text credential with the id
`twenty-dev-database-url`, then set `ENABLE_DRIFT_CHECK = 'true'` in
`Jenkinsfile.dev`. Nothing else changes.

## Commands

```bash
yarn install

# 1. snapshot dev into src/
TWENTY_DEV_DATABASE_URL=postgres://twenty_model_reader:...@dev-host:5432/default yarn model:pull

# 2. preview what would happen on a target instance — changes nothing
yarn twenty remote:use prod
yarn model:plan

# 3. deploy — bumps the version, builds, publishes, installs, applies the
#    post-install steps and verifies, in that order
yarn model:deploy prod
```

`model:pull` needs a **read-only** database user. It never writes to dev.

Set `TWENTY_WORKSPACE_ID` as well if the instance ever hosts more than one
workspace — the script refuses to guess.

## What is generated and what is not

`src/objects`, `src/fields`, `src/views`, `src/view-fields`, `src/page-layouts`,
`src/navigation-menu-items`, `src/indexes` and `src/prerequisites` are wiped and
rewritten on every pull. **Do not hand-edit them** — deleting something in dev is
supposed to show up as a deleted file in the diff.

`src/application.config.ts` and `src/roles/default.role.ts` are hand-written and
never touched by the pull.

### Deliberate omissions

- **The four relations every object gets** (`noteTargets`, `taskTargets`,
  `attachments`, `timelineActivities`) and their reverse side. The SDK injects
  these into the manifest itself, with its own identifiers; declaring them here
  would collide. See `get-default-relation-object-fields.ts` in `twenty-sdk`.
- **Auto-created indexes** — foreign key BTREEs and the `searchVector` GIN. The
  server recreates them on prod. Only indexes you created yourself are pulled.
- **Roles and role assignments.** Prod has its own users; syncing role membership
  from dev would be wrong. Manage roles per instance.
- **Records.** Only the shape of the data travels, never the data.
- **Active/inactive state.** The manifest cannot express a deactivated object or
  field, so anything deactivated in dev arrives active on prod. The pull warns
  when it finds one.

### Known gap: record page sections on standard objects

A view field group (the sections on a record page) can only be declared nested
inside a view that this app owns. There is no standalone `defineViewFieldGroup`.

Sections you added to a **standard** object's record page — Company, Opportunity
— therefore cannot ship in the manifest. `model:pull` writes them to
`src/prerequisites/view-field-groups.json` and warns.

They cannot be created with matching identifiers over the API either:
`CreateViewFieldGroupInput` marks `universalIdentifier` as `@HideField()`, so it
is not part of the GraphQL schema. Creating one through the API would give it a
fresh identifier that the manifest does not reference.

So `model:pull` **drops the group reference** from the affected view fields
rather than ship an identifier that will not resolve. The consequence is purely
cosmetic: those fields install correctly but appear ungrouped on the target's
record page instead of under their section heading.

The groups themselves are still recorded in
`src/prerequisites/view-field-groups.json` so nothing is lost track of.

**To restore grouping later** — a small change to this fork, worth doing only if
the sections matter visually:

1. Remove `@HideField()` from `universalIdentifier` in
   `packages/twenty-server/src/engine/metadata-modules/view-field-group/dtos/inputs/create-view-field-group.input.ts`
   and expose it as a normal nullable `@Field()`.
2. Deploy that server change.
3. Create the sections on the target with the identifiers from the JSON file.
4. Re-enable the reference in `pull-model.ts` (the `viewFieldGroupUniversalIdentifier: undefined`
   line, which is commented for this reason) and re-pull.

## Rules that keep this working

1. **Never edit the schema through the prod UI.** Prod is generated. A field
   created by hand there is invisible to this repo and will be deleted on the
   next install.
2. **Never change `APPLICATION_UNIVERSAL_IDENTIFIER`** in
   `src/application.config.ts`. It is how prod recognises this app; changing it
   orphans everything the app owns.
3. **Read the plan before applying.** `yarn model:plan` prints the migration.
   Deletes drop columns and the data in them, permanently.
4. **Never `app:install` against the hosted dev instance.** Dev's model is
   hand-authored and owned by its own Custom application; installing this app
   there collides with it. Dev is the source, prod is the copy.
