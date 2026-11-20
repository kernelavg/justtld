#!/usr/bin/env bash
# JustTLD — общие переменные и поиск бинарников PostgreSQL.
# Подключается через `source scripts/pg-env.sh`.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[env] создан .env из .env.example"
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

export PGDATA="${PGDATA:-./data/pgdata}"
export PGPORT="${PGPORT:-5432}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGUSER="${PGUSER:-justtld}"
export PGPASSWORD="${PGPASSWORD:-justtld}"

# DATABASE_URL имеет приоритет для имени/пользователя/пароля БД.
if [ -n "${DATABASE_URL:-}" ]; then
  _url_no_scheme="${DATABASE_URL#*://}"
  _creds="${_url_no_scheme%%@*}"
  _hostpart="${_url_no_scheme#*@}"
  if [ "$_creds" != "$_url_no_scheme" ]; then
    export PGUSER="${_creds%%:*}"
    if [ "$_creds" != "${_creds%%:*}" ]; then
      export PGPASSWORD="${_creds#*:}"
    fi
    _hostport="${_hostpart%%/*}"
    _dbpart="${_hostpart#*/}"
    export PGHOST="${_hostport%%:*}"
    if [ "$_hostport" != "${_hostport%%:*}" ]; then
      export PGPORT="${_hostport##*:}"
    fi
    export DB_NAME="${_dbpart%%\?*}"
  fi
fi

export DB_NAME="${DB_NAME:-justtld}"

# ── Поиск бинарников PostgreSQL ──
pg_find_bin() {
  if command -v initdb >/dev/null 2>&1; then
    dirname "$(command -v initdb)"
    return 0
  fi
  local candidate
  for candidate in $(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -rV) \
                   $(ls -d /opt/homebrew/opt/postgresql*/bin 2>/dev/null | sort -rV) \
                   $(ls -d /usr/local/opt/postgresql*/bin 2>/dev/null | sort -rV) \
                   /Applications/Postgres.app/Contents/Versions/latest/bin; do
    if [ -x "$candidate/initdb" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

pg_install_if_needed() {
  if PG_BIN="$(pg_find_bin)"; then
    return 0
  fi
  echo "[db] PostgreSQL не найден, пробую установить…"
  if command -v apt-get >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then
      apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
    elif sudo -n true 2>/dev/null; then
      sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
    else
      echo "[db] Нет прав для установки. Установите PostgreSQL вручную: sudo apt-get install postgresql" >&2
      exit 1
    fi
  elif command -v brew >/dev/null 2>&1; then
    brew install postgresql@16
  else
    echo "[db] Неизвестный пакетный менеджер. Установите PostgreSQL 15+ вручную." >&2
    exit 1
  fi
  PG_BIN="$(pg_find_bin)" || {
    echo "[db] Не удалось найти бинарники PostgreSQL после установки." >&2
    exit 1
  }
  export PG_BIN
}

pg_is_running() {
  [ -s "$PGDATA/PG_VERSION" ] || return 1
  "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1
}
