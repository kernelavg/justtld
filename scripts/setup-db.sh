#!/usr/bin/env bash
# JustTLD — инициализация локального кластера PostgreSQL (идемпотентно).
# Создаёт data/pgdata, запускает сервер на PGPORT, создаёт БД и расширения.
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pg-env.sh"

pg_install_if_needed
echo "[db] PostgreSQL: $("$PG_BIN/postgres" --version)"

mkdir -p "$(dirname "$PGDATA")" logs

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[db] initdb → $PGDATA"
  "$PG_BIN/initdb" -D "$PGDATA" -U "$PGUSER" \
    --auth-local=trust --auth-host=trust -E UTF8 --locale=C >/dev/null
  {
    echo "port = $PGPORT"
    echo "listen_addresses = '127.0.0.1'"
    echo "unix_socket_directories = '/tmp'"
    echo "max_connections = 100"
  } >> "$PGDATA/postgresql.conf"
else
  echo "[db] кластер уже инициализирован: $PGDATA"
fi

if pg_is_running; then
  echo "[db] сервер уже запущен (порт $PGPORT)"
else
  echo "[db] запуск сервера на 127.0.0.1:$PGPORT"
  "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$ROOT_DIR/logs/postgres.log" \
    -o "-p $PGPORT -h 127.0.0.1 -k /tmp" -w start >/dev/null
fi

# Роль и БД
if ! "$PG_BIN/psql" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname='$PGUSER'" | grep -q 1; then
  "$PG_BIN/psql" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c \
    "CREATE ROLE \"$PGUSER\" LOGIN SUPERUSER PASSWORD '$PGPASSWORD'" >/dev/null
fi

if ! "$PG_BIN/psql" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  "$PG_BIN/createdb" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$DB_NAME"
  echo "[db] создана база $DB_NAME"
fi

"$PG_BIN/psql" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -q -c \
  "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null

echo "[db] готово: postgresql://$PGUSER:***@$PGHOST:$PGPORT/$DB_NAME"
