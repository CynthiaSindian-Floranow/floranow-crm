#!/bin/sh
set -e

JOB="${1:-provision}"

CRM_URL="${TWENTY_PROD_URL:-${TWENTY_DEV_URL:-not set}}"
ERP_URL="${ERP_PROD_URL:-${ERP_DEV_URL:-not set}}"

echo "=================================================="
echo "Floranow CRM <-> ERP Sync Runner"
echo "Job Target : ${JOB}"
echo "CRM URL    : ${CRM_URL}"
echo "ERP URL    : ${ERP_URL}"
echo "Timestamp  : $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "=================================================="

case "$JOB" in
  provision)
    if [ -n "$TWENTY_PROD_URL" ]; then
      exec yarn sync:prod:apply
    else
      exec yarn sync:dev:apply
    fi
    ;;
  provision:prod)
    exec yarn sync:prod:apply
    ;;
  provision:dev)
    exec yarn sync:dev:apply
    ;;
  provision:dry-run)
    if [ -n "$TWENTY_PROD_URL" ]; then
      exec yarn sync:prod
    else
      exec yarn sync:dev
    fi
    ;;
  mirror)
    if [ -n "$TWENTY_PROD_URL" ]; then
      exec yarn mirror:prod:apply
    else
      exec yarn mirror:dev:apply
    fi
    ;;
  mirror:prod)
    exec yarn mirror:prod:apply
    ;;
  mirror:dev)
    exec yarn mirror:dev:apply
    ;;
  mirror:dry-run)
    if [ -n "$TWENTY_PROD_URL" ]; then
      exec yarn mirror:prod
    else
      exec yarn mirror:dev
    fi
    ;;
  records)
    echo "Running child records sync sequentially..."
    set -o pipefail
    if [ -n "$TWENTY_PROD_URL" ]; then
      yarn standing-orders:prod:apply
      yarn order-events:prod:apply
      yarn incidents:prod:apply
    else
      yarn standing-orders:dev:apply
      yarn order-events:dev:apply
      yarn incidents:dev:apply
    fi
    ;;
  records:prod)
    echo "Running child records sync sequentially (prod)..."
    set -o pipefail
    yarn standing-orders:prod:apply
    yarn order-events:prod:apply
    yarn incidents:prod:apply
    ;;
  records:dev)
    echo "Running child records sync sequentially (dev)..."
    set -o pipefail
    yarn standing-orders:dev:apply
    yarn order-events:dev:apply
    yarn incidents:dev:apply
    ;;
  records:dry-run)
    echo "Running child records dry-run sequentially..."
    if [ -n "$TWENTY_PROD_URL" ]; then
      yarn standing-orders:prod
      yarn order-events:prod
      yarn incidents:prod
    else
      yarn standing-orders:dev
      yarn order-events:dev
      yarn incidents:dev
    fi
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
