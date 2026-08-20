#!/usr/bin/env bash
# Deploys the committed snapshot to a remote, in the right order, with the
# version bumped automatically.
#
#   yarn model:deploy            # deploys to the "prod" remote
#   yarn model:deploy staging    # deploys to another configured remote
#
# The version bump is not optional: `app:publish` refuses to republish an
# existing version, and an install that finds no new version silently reuses the
# previous package and still reports success. Doing it here means it cannot be
# forgotten.
#
# Remote credentials come from ~/.twenty/config.json, which `twenty remote:add`
# writes. The same entry is reused for the post-install and verify steps so
# there is a single place to configure a target.

set -euo pipefail

cd "$(dirname "$0")/.."

REMOTE="${1:-prod}"

read_remote() {
  node -e "
    const fs = require('fs'), path = require('path'), os = require('os');
    const file = path.join(os.homedir(), '.twenty', 'config.json');
    let config;
    try {
      config = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      console.error('Could not read ' + file + '. Run: yarn twenty remote:add');
      process.exit(1);
    }
    const remote = (config.remotes || {})['$REMOTE'];
    if (!remote) {
      console.error('Remote \"$REMOTE\" is not configured. Run: yarn twenty remote:add');
      process.exit(1);
    }
    console.log(remote.$1);
  "
}

TARGET_URL="$(read_remote apiUrl)"
TARGET_KEY="$(read_remote apiKey)"

echo "Deploying to remote '$REMOTE' ($TARGET_URL)"
echo

if [ -n "$(git status --porcelain -- src)" ]; then
  echo "WARNING: src/ has uncommitted changes."
  echo "You are about to deploy something that is not in git."
  echo
fi

VERSION="$(node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const parts = pkg.version.split('.').map(Number);
  parts[2] += 1;
  pkg.version = parts.join('.');
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log(pkg.version);
")"

echo "==> version bumped to $VERSION"

echo "==> building"
yarn twenty dev:build .

echo "==> publishing"
yarn twenty app:publish --private --remote "$REMOTE"

echo "==> installing"
yarn twenty app:install --remote "$REMOTE"

echo "==> applying what the manifest cannot carry"
TWENTY_TARGET_URL="$TARGET_URL" TWENTY_TARGET_API_KEY="$TARGET_KEY" \
  yarn model:post-install --apply

echo "==> verifying"
TWENTY_TARGET_URL="$TARGET_URL" TWENTY_TARGET_API_KEY="$TARGET_KEY" \
  yarn model:verify

echo
echo "Deployed $VERSION to $REMOTE. Commit the version bump in package.json."
