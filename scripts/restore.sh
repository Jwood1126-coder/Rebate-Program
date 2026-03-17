#!/usr/bin/env bash
# Database restore script for Rebate Management System
# Restores from either plain SQL or pg_dump custom format backups.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<EOF
Usage: $(basename "$0") <backup-file> [OPTIONS]

Restore the Rebate Management database from a backup file.

Arguments:
  <backup-file>           Path to the backup file (.sql or .dump)

Options:
  --yes                   Skip confirmation prompt
  --help                  Show this help message

The restore format is auto-detected from the file extension:
  .sql   — restored with psql (plain SQL)
  .dump  — restored with pg_restore (custom format)

WARNING: This will DROP and recreate the target database.

Environment:
  Reads DATABASE_URL from .env in project root.
EOF
  exit 0
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
BACKUP_FILE=""
SKIP_CONFIRM=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)
      SKIP_CONFIRM=true; shift ;;
    --help|-h)
      usage ;;
    -*)
      echo "Error: unknown option '$1'. Use --help for usage." >&2
      exit 1 ;;
    *)
      if [[ -z "$BACKUP_FILE" ]]; then
        BACKUP_FILE="$1"; shift
      else
        echo "Error: unexpected argument '$1'." >&2
        exit 1
      fi ;;
  esac
done

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Error: backup file argument required. Use --help for usage." >&2
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Error: file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

# Detect format from extension
case "$BACKUP_FILE" in
  *.sql)
    RESTORE_FORMAT="sql" ;;
  *.dump)
    RESTORE_FORMAT="custom" ;;
  *)
    echo "Error: unrecognized file extension. Expected .sql or .dump" >&2
    exit 1 ;;
esac

# ---------------------------------------------------------------------------
# Read DATABASE_URL from .env
# ---------------------------------------------------------------------------
ENV_FILE="${PROJECT_ROOT}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' | tr -d "'")"
if [[ -z "$DATABASE_URL" ]]; then
  echo "Error: DATABASE_URL not found in .env" >&2
  exit 1
fi

CONN_URL="${DATABASE_URL%%\?*}"

DB_USER="$(echo "$CONN_URL" | sed -n 's|^postgresql://\([^:]*\):.*|\1|p')"
DB_PASS="$(echo "$CONN_URL" | sed -n 's|^postgresql://[^:]*:\([^@]*\)@.*|\1|p')"
DB_HOST="$(echo "$CONN_URL" | sed -n 's|^postgresql://[^@]*@\([^:]*\):.*|\1|p')"
DB_PORT="$(echo "$CONN_URL" | sed -n 's|^postgresql://[^@]*@[^:]*:\([^/]*\)/.*|\1|p')"
DB_NAME="$(echo "$CONN_URL" | sed -n 's|^postgresql://[^/]*/\(.*\)|\1|p')"

if [[ -z "$DB_NAME" || -z "$DB_HOST" ]]; then
  echo "Error: could not parse DATABASE_URL." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Confirmation
# ---------------------------------------------------------------------------
FILE_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
echo "Restore details:"
echo "  File:     ${BACKUP_FILE}"
echo "  Size:     ${FILE_SIZE}"
echo "  Format:   ${RESTORE_FORMAT}"
echo "  Database: ${DB_NAME} @ ${DB_HOST}:${DB_PORT}"
echo ""
echo "WARNING: This will DROP all existing data in '${DB_NAME}' and replace it."

if [[ "$SKIP_CONFIRM" != true ]]; then
  read -r -p "Continue? [y/N] " response
  case "$response" in
    [yY][eE][sS]|[yY]) ;;
    *)
      echo "Restore cancelled."
      exit 0 ;;
  esac
fi

export PGPASSWORD="$DB_PASS"

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------
echo ""
echo "Restoring database..."

if [[ "$RESTORE_FORMAT" == "sql" ]]; then
  # Drop and recreate the database, then restore
  # Use the 'postgres' maintenance database for admin commands
  psql \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="postgres" \
    --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
    --command="DROP DATABASE IF EXISTS \"${DB_NAME}\";" \
    --command="CREATE DATABASE \"${DB_NAME}\";" \
    2>&1

  psql \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --file="$BACKUP_FILE" \
    --quiet \
    2>&1
else
  # Custom format: use pg_restore with --clean --create
  psql \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="postgres" \
    --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
    --command="DROP DATABASE IF EXISTS \"${DB_NAME}\";" \
    --command="CREATE DATABASE \"${DB_NAME}\";" \
    2>&1

  pg_restore \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --no-owner \
    --no-acl \
    --verbose \
    "$BACKUP_FILE" \
    2>&1 | tail -1
fi

unset PGPASSWORD

echo ""
echo "Restore complete!"
echo "  Database '${DB_NAME}' has been restored from: ${BACKUP_FILE}"
echo ""
echo "Next steps:"
echo "  - Run 'npx prisma generate' to regenerate the Prisma client"
echo "  - Verify the application connects correctly"
