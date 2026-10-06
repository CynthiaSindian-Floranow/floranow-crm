#!/bin/sh
set -e

JOB="${1:-provision}"

echo "=================================================="
echo "Floranow CRM <-> ERP Sync Runner"
echo "Job Target : ${JOB}"
echo "CRM URL    : ${TWENTY_DEV_URL:-not set}"
echo "ERP URL    : ${ERP_DEV_URL:-not set}"
echo "Timestamp  : $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "=================================================="

case "$JOB" in
  provision)
    exec yarn sync:dev:apply
    ;;
  provision:dry-run)
    exec yarn sync:dev
    ;;
  mirror)
    exec yarn mirror:dev:apply
    ;;
  mirror:dry-run)
    exec yarn mirror:dev
    ;;
  records)
    echo "Running child records sync sequentially..."
    set -o pipefail
    yarn standing-orders:dev:apply
    yarn order-events:dev:apply
    yarn incidents:dev:apply
    ;;
  records:dry-run)
    echo "Running child records dry-run sequentially..."
    yarn standing-orders:dev
    yarn order-events:dev
    yarn incidents:dev
    ;;
  test)
    echo "Running typecheck and test suite..."
    yarn typecheck && yarn test
    ;;
  trigger)
    echo "Starting in-cluster manual trigger webhook server..."
    exec yarn tsx src/trigger-server.ts
    ;;
  yarn|sh|bash|node)
    exec "$@"
    ;;
  *)
    echo "Unknown job target: $JOB"
    echo "Supported targets: provision | provision:dry-run | mirror | mirror:dry-run | records | records:dry-run | trigger | test"
    exit 1
    ;;
esac
