#!/usr/bin/env bash
# Database backup script for Rebate Management System
# Creates timestamped pg_dump backups with rotation.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Defaults
BACKUP_DIR="${PROJECT_ROOT}/backups"
FORMAT="sql"
KEEP=10

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Create a PostgreSQL backup of the Rebate Management database.

Options:
  --format <sql|custom>   Backup format (default: sql)
                            sql    — plain SQL, restore with psql
                            custom — pg_dump custom format, supports parallel restore
  --dir <path>            Backup directory (default: ./backups)
  --keep <n>              Number of backups to retain (default: 10)
  --help                  Show this help message

Examples:
  $(basename "$0")                        # SQL dump, keep 10
  $(basename "$0") --format custom        # Custom format
  $(basename "$0") --keep 5 --dir /tmp    # Keep 5, store in /tmp

Environment:
  Reads DATABASE_URL from .env in project root.
EOF
  exit 0
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --format)
      FORMAT="$2"; shift 2 ;;
    --dir)
      BACKUP_DIR="$2"; shift 2 ;;
    --keep)
      KEEP="$2"; shift 2 ;;
    --help|-h)
      usage ;;
    *)
      echo "Error: unknown option '$1'. Use --help for usage." >&2
      exit 1 ;;
  esac
done

# Validate format
if [[ "$FORMAT" != "sql" && "$FORMAT" != "custom" ]]; then
  echo "Error: --format must be 'sql' or 'custom'." >&2
  exit 1
fi

# Validate keep is a positive integer
if ! [[ "$KEEP" =~ ^[1-9][0-9]*$ ]]; then
  echo "Error: --keep must be a positive integer." >&2
  exit 1
fi

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

# Parse DATABASE_URL — format: postgresql://user:pass@host:port/dbname?params
# Strip query string for pg_dump connection
CONN_URL="${DATABASE_URL%%\?*}"

# Extract components
DB_USER="$(echo "$CONN_URL" | sed -n 's|^postgresql://\([^:]*\):.*|\1|p')"
DB_PASS="$(echo "$CONN_URL" | sed -n 's|^postgresql://[^:]*:\([^@]*\)@.*|\1|p')"
DB_HOST="$(echo "$CONN_URL" | sed -n 's|^postgresql://[^@]*@\([^:]*\):.*|\1|p')"
DB_PORT="$(echo "$CONN_URL" | sed -n 's|^postgresql://[^@]*@[^:]*:\([^/]*\)/.*|\1|p')"
DB_NAME="$(echo "$CONN_URL" | sed -n 's|^postgresql://[^/]*/\(.*\)|\1|p')"

if [[ -z "$DB_NAME" || -z "$DB_HOST" ]]; then
  echo "Error: could not parse DATABASE_URL. Expected format:" >&2
  echo "  postgresql://user:pass@host:port/dbname" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Prepare backup directory
# ---------------------------------------------------------------------------
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

if [[ "$FORMAT" == "sql" ]]; then
  FILENAME="rebate_backup_${TIMESTAMP}.sql"
  PG_FORMAT_FLAG="--format=plain"
else
  FILENAME="rebate_backup_${TIMESTAMP}.dump"
  PG_FORMAT_FLAG="--format=custom"
fi

BACKUP_PATH="${BACKUP_DIR}/${FILENAME}"

# ---------------------------------------------------------------------------
# Cleanup trap
# ---------------------------------------------------------------------------
cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 && -f "$BACKUP_PATH" ]]; then
    rm -f "$BACKUP_PATH"
    echo "Backup failed — partial file removed." >&2
  fi
  exit $exit_code
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-flight: check for pg_dump
# ---------------------------------------------------------------------------
if ! command -v pg_dump &> /dev/null; then
  echo "ERROR: pg_dump not found. Install postgresql-client:"
  echo "  Ubuntu/Debian: sudo apt install postgresql-client"
  echo "  macOS:         brew install libpq"
  echo "  Docker:        docker exec <pg-container> pg_dump ..."
  exit 1
fi

# ---------------------------------------------------------------------------
# Run pg_dump
# ---------------------------------------------------------------------------
echo "Starting backup..."
echo "  Database: ${DB_NAME} @ ${DB_HOST}:${DB_PORT}"
echo "  Format:   ${FORMAT}"
echo "  Output:   ${BACKUP_PATH}"

export PGPASSWORD="$DB_PASS"

pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  $PG_FORMAT_FLAG \
  --no-owner \
  --no-acl \
  --verbose \
  --file="$BACKUP_PATH" \
  2>&1 | tail -1

unset PGPASSWORD

# ---------------------------------------------------------------------------
# Verify and report
# ---------------------------------------------------------------------------
if [[ ! -s "$BACKUP_PATH" ]]; then
  echo "Error: backup file is empty or missing." >&2
  exit 1
fi

FILE_SIZE="$(du -h "$BACKUP_PATH" | cut -f1)"
echo ""
echo "Backup complete!"
echo "  File: ${BACKUP_PATH}"
echo "  Size: ${FILE_SIZE}"

# ---------------------------------------------------------------------------
# Rotate old backups
# ---------------------------------------------------------------------------
if [[ "$FORMAT" == "sql" ]]; then
  PATTERN="rebate_backup_*.sql"
else
  PATTERN="rebate_backup_*.dump"
fi

# List backups sorted oldest-first, remove extras beyond KEEP
EXISTING=()
while IFS= read -r f; do
  EXISTING+=("$f")
done < <(ls -1t "${BACKUP_DIR}"/${PATTERN} 2>/dev/null || true)

TOTAL=${#EXISTING[@]}
if [[ $TOTAL -gt $KEEP ]]; then
  REMOVED=$(( TOTAL - KEEP ))
  echo ""
  echo "Rotating backups (keeping ${KEEP}, removing ${REMOVED})..."
  for (( i=KEEP; i<TOTAL; i++ )); do
    echo "  Removing: $(basename "${EXISTING[$i]}")"
    rm -f "${EXISTING[$i]}"
  done
fi

echo ""
echo "Done. ${KEEP} most recent ${FORMAT} backups retained in ${BACKUP_DIR}/"
