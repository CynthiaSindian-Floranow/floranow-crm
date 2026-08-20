#!/usr/bin/env bash
# Fails if the committed snapshot in src/ no longer matches the dev workspace —
# i.e. somebody changed the data model in the dev UI and did not run model:pull.
#
# Runs anywhere the dev database is reachable: your laptop, a git pre-push hook,
# or a CI job. Needs TWENTY_DEV_DATABASE_URL.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${TWENTY_DEV_DATABASE_URL:-}" ]; then
  echo "TWENTY_DEV_DATABASE_URL is not set — skipping the data model snapshot check."
  echo "Set it to the dev database (read-only role) to enable this check."
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "Dependencies are not installed in the data model app."
  echo "Run once:  cd packages/twenty-apps/floranow/data-model && yarn install"
  exit 1
fi

yarn model:pull >/dev/null

if git diff --quiet -- src; then
  echo "Data model snapshot is up to date."
  exit 0
fi

cat <<'MESSAGE'
----------------------------------------------------------------------
The committed data model snapshot does not match the dev workspace.

Somebody changed the model in the dev UI without committing it. If this
ships as-is, prod will silently be missing that change.

Fix it:

    cd packages/twenty-apps/floranow/data-model
    yarn model:pull
    git add src && git commit -m "Pull data model from dev"

Changed files:
----------------------------------------------------------------------
MESSAGE

git --no-pager diff --stat -- src

exit 1
