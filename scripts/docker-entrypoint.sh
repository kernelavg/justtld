#!/usr/bin/env bash
# Точка входа контейнера: миграции → (опционально) indexer → основная команда.
set -euo pipefail

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] применяю миграции базы…"
  # Миграции идемпотентны: повторный запуск ничего не ломает.
  npx tsx packages/db/src/migrate.ts || echo "[entrypoint] миграции не применились (проверьте DATABASE_URL)"
fi

# На бесплатном тарифе PaaS фоновый воркер обычно недоступен платно,
# поэтому indexer можно поднять в том же контейнере.
if [ "${RUN_INDEXER_IN_WEB:-false}" = "true" ]; then
  echo "[entrypoint] запускаю indexer в фоне…"
  npm run indexer &
fi

echo "[entrypoint] запуск: $*"
exec "$@"
