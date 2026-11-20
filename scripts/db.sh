#!/usr/bin/env bash
# JustTLD — управление локальным PostgreSQL.
# Использование: bash scripts/db.sh {start|stop|status|restart|psql|init}
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pg-env.sh"

cmd="${1:-status}"

case "$cmd" in
  init|setup)
    exec bash "$ROOT_DIR/scripts/setup-db.sh"
    ;;
  start)
    pg_install_if_needed
    if pg_is_running; then
      echo "[db] уже запущен (127.0.0.1:$PGPORT)"
    else
      "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$ROOT_DIR/logs/postgres.log" \
        -o "-p $PGPORT -h 127.0.0.1 -k /tmp" -w start
    fi
    ;;
  stop)
    pg_install_if_needed
    if pg_is_running; then
      "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast -w stop
    else
      echo "[db] не запущен"
    fi
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    pg_install_if_needed
    if pg_is_running; then
      echo "[db] запущен: 127.0.0.1:$PGPORT, база $DB_NAME, данные $PGDATA"
      "$PG_BIN/psql" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -tAc \
        "SELECT 'зоны: ' || count(*) FROM zones" 2>/dev/null || true
    else
      echo "[db] остановлен"
      exit 1
    fi
    ;;
  psql)
    pg_install_if_needed
    exec "$PG_BIN/psql" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME"
    ;;
  *)
    echo "Использование: bash scripts/db.sh {start|stop|status|restart|psql|init}" >&2
    exit 1
    ;;
esac
