#!/usr/bin/env bash
# JustTLD — восстановление PostgreSQL из резервной копии.
# Использование:
#   bash scripts/restore-db.sh                 # последняя копия из data/backups
#   bash scripts/restore-db.sh path/to.dump    # конкретный файл
#   bash scripts/restore-db.sh --sql path.sql  # из plain SQL
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pg-env.sh"

pg_install_if_needed

mode="dump"
if [ "${1:-}" = "--sql" ]; then
  mode="sql"
  shift
fi

source_file="${1:-}"
if [ -z "$source_file" ]; then
  source_file="$(ls -t "$ROOT_DIR"/data/backups/*.dump 2>/dev/null | head -1 || true)"
fi

if [ -z "$source_file" ] || [ ! -f "$source_file" ]; then
  echo "[restore] не найдена резервная копия. Список: ls data/backups" >&2
  exit 1
fi

if ! pg_is_running; then
  echo "[restore] PostgreSQL не запущен. Запускаю…"
  bash "$ROOT_DIR/scripts/db.sh" start
fi

echo "[restore] источник: $source_file"
echo "[restore] ВНИМАНИЕ: текущие данные базы $DB_NAME будут перезаписаны."
echo "[restore] Остановите indexer (Ctrl+C или npm run stop:all) и после восстановления"
echo "          запустите его снова — он досинхронизирует состояние из блокчейна."

if [ "$mode" = "dump" ]; then
  "$PG_BIN/pg_restore" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" \
    --clean --if-exists --no-owner --no-privileges --single-transaction "$source_file"
else
  "$PG_BIN/psql" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$source_file" >/dev/null
fi

echo "[restore] готово. Проверка:"
"$PG_BIN/psql" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -tAc \
  "SELECT 'зоны: ' || count(*) FROM zones"
"$PG_BIN/psql" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -tAc \
  "SELECT 'события: ' || count(*) FROM zone_events"
