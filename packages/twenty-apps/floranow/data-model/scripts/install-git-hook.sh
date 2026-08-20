#!/usr/bin/env bash
# Installs a pre-push hook that catches an out-of-date data model snapshot
# before it reaches Jenkins. Run once per clone:
#
#   bash packages/twenty-apps/floranow/data-model/scripts/install-git-hook.sh
#
# The hook is a no-op unless TWENTY_DEV_DATABASE_URL is set in your shell, so it
# never blocks teammates who do not work on the data model.
# Skip it for one push with:  SKIP_MODEL_CHECK=1 git push

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK_PATH="$REPO_ROOT/.git/hooks/pre-push"

if [ -e "$HOOK_PATH" ] && ! grep -q "check-snapshot.sh" "$HOOK_PATH"; then
  echo "A pre-push hook already exists and is not ours:"
  echo "  $HOOK_PATH"
  echo "Add this line to it by hand instead:"
  echo "  bash packages/twenty-apps/floranow/data-model/scripts/check-snapshot.sh"
  exit 1
fi

cat > "$HOOK_PATH" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail

if [ "${SKIP_MODEL_CHECK:-}" = "1" ]; then
  exit 0
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"

bash "$REPO_ROOT/packages/twenty-apps/floranow/data-model/scripts/check-snapshot.sh"
HOOK

chmod +x "$HOOK_PATH"

echo "Installed pre-push hook at $HOOK_PATH"
