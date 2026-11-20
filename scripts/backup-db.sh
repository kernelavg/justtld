#!/usr/bin/env bash
# JustTLD — резервная копия PostgreSQL.
# Использование: bash scripts/backup-db.sh [файл]
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pg-env.sh"

pg_install_if_needed
mkdir -p "$ROOT_DIR/data/backups"

stamp="$(date +%Y%m%d-%H%M%S)"
target="${1:-$ROOT_DIR/data/backups/justtld-$stamp.dump}"

if ! pg_is_running; then
  echo "[backup] PostgreSQL не запущен. Запустите: bash scripts/db.sh start" >&2
  exit 1
fi

echo "[backup] pg_dump → $target"
"$PG_BIN/pg_dump" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" \
  --format=custom --no-owner --no-privileges --file "$target"

# Дополнительно: человекочитаемый SQL-дамп (удобно для diff и аудита).
sql_target="${target%.dump}.sql"
"$PG_BIN/pg_dump" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" \
  --no-owner --no-privileges --file "$sql_target"

echo "[backup] готово:"
ls -lh "$target" "$sql_target" | awk '{print "  " $9 " (" $5 ")"}'
echo "[backup] восстановить: bash scripts/restore-db.sh $(basename "$target")"
