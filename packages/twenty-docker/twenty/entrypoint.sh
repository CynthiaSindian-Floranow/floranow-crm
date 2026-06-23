#!/bin/sh
set -e

setup_and_migrate_db() {
    if [ "${DISABLE_DB_MIGRATIONS}" = "true" ]; then
        echo "Database setup and migrations are disabled, skipping..."
        return
    fi

    echo "Running database setup and migrations..."

    # Fail fast with a clear message instead of letting psql silently fall back
    # to the local unix socket when PG_DATABASE_URL is not provided.
    if [ -z "${PG_DATABASE_URL}" ]; then
        echo "ERROR: PG_DATABASE_URL is not set. Provide it via the container environment (env file or -e) before starting." >&2
        exit 1
    fi

    # Append sslmode for the psql check so managed databases (e.g. AWS RDS) that
    # use self-signed certs don't break the SSL handshake.
    psql_url="${PG_DATABASE_URL}"
    if [ "${PG_SSL_ALLOW_SELF_SIGNED}" = "true" ] && ! echo "${psql_url}" | grep -q "sslmode="; then
        case "${psql_url}" in
            *\?*) psql_url="${psql_url}&sslmode=no-verify" ;;
            *)    psql_url="${psql_url}?sslmode=no-verify" ;;
        esac
    fi

    # Run setup and migration scripts
    has_schema=$(psql -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'core')" "${psql_url}")
    if [ "$has_schema" = "f" ]; then
        echo "Database appears to be empty, running migrations."
        yarn database:init:prod
    fi

    if ! yarn command:prod cache:flush; then
        echo "Warning: Failed to flush cache before upgrade, but continuing startup..."
    fi

    if ! yarn command:prod upgrade; then
        echo "Warning: Upgrade completed with errors. Some workspaces may not be fully migrated. Check logs for details."
    fi

    if ! yarn command:prod cache:flush; then
        echo "Warning: Failed to flush cache after upgrade, but continuing startup..."
    fi

    echo "Successfully migrated DB!"
}

register_background_jobs() {
    if [ "${DISABLE_CRON_JOBS_REGISTRATION}" = "true" ]; then
        echo "Cron job registration is disabled, skipping..."
        return
    fi

    echo "Registering background sync jobs..."
    if yarn command:prod cron:register:all; then
        echo "Successfully registered all background sync jobs!"
    else
        echo "Warning: Failed to register background jobs, but continuing startup..."
    fi
}

setup_and_migrate_db
register_background_jobs

# Continue with the original Docker command
exec "$@"
