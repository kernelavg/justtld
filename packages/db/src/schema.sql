-- JustTLD database schema (PostgreSQL 15+).
-- Блокчейн — источник истины; эти таблицы — кэш, история и аналитика.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'zone_status') THEN
    CREATE TYPE zone_status AS ENUM ('active', 'expired', 'blocked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfer_status') THEN
    CREATE TYPE transfer_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');
  END IF;
END$$;

-- ───────────────────────────── users ─────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  display_name   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_wallet_fmt CHECK (wallet_address ~ '^0x[0-9a-f]{40}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS users_wallet_address_key ON users (wallet_address);

-- ───────────────────────────── zones ─────────────────────────────
CREATE TABLE IF NOT EXISTS zones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tld              text NOT NULL,
  owner_address    text NOT NULL,
  status           zone_status NOT NULL DEFAULT 'active',
  registered_at    timestamptz NOT NULL,
  expires_at       timestamptz NOT NULL,
  metadata         text NOT NULL DEFAULT '',
  transaction_hash text NOT NULL,
  block_number     bigint NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zones_tld_fmt   CHECK (tld ~ '^\.[a-z0-9-]{2,19}$'),
  CONSTRAINT zones_owner_fmt CHECK (owner_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT zones_tx_fmt    CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS zones_tld_key            ON zones (tld);
CREATE INDEX IF NOT EXISTS zones_owner_idx                 ON zones (owner_address);
CREATE INDEX IF NOT EXISTS zones_status_expires_idx        ON zones (status, expires_at);
CREATE INDEX IF NOT EXISTS zones_registered_idx            ON zones (registered_at DESC);
CREATE INDEX IF NOT EXISTS zones_tld_trgm_idx              ON zones USING gin (tld gin_trgm_ops);
CREATE INDEX IF NOT EXISTS zones_metadata_trgm_idx         ON zones USING gin (metadata gin_trgm_ops);

-- ─────────────────────────── zone_events ─────────────────────────
CREATE TABLE IF NOT EXISTS zone_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id          uuid NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  event_type       text NOT NULL,
  actor_address    text NOT NULL,
  transaction_hash text NOT NULL,
  block_number     bigint NOT NULL,
  log_index        int NOT NULL DEFAULT 0,
  details          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zone_events_type_chk CHECK (
    event_type IN ('registered', 'transferred', 'renewed', 'metadata_updated', 'blocked', 'unblocked')
  )
);
CREATE INDEX IF NOT EXISTS zone_events_zone_created_idx ON zone_events (zone_id, created_at DESC);
CREATE INDEX IF NOT EXISTS zone_events_actor_idx        ON zone_events (actor_address);
CREATE INDEX IF NOT EXISTS zone_events_type_idx         ON zone_events (event_type);
CREATE UNIQUE INDEX IF NOT EXISTS zone_events_log_key
  ON zone_events (transaction_hash, log_index);

-- ──────────────────────── transfer_requests ──────────────────────
CREATE TABLE IF NOT EXISTS transfer_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id          uuid NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  from_address     text NOT NULL,
  to_address       text NOT NULL,
  status           transfer_status NOT NULL DEFAULT 'pending',
  transaction_hash text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  CONSTRAINT transfer_diff_addresses CHECK (lower(from_address) <> lower(to_address))
);
CREATE INDEX IF NOT EXISTS transfer_requests_zone_idx   ON transfer_requests (zone_id);
CREATE INDEX IF NOT EXISTS transfer_requests_status_idx ON transfer_requests (status);
CREATE UNIQUE INDEX IF NOT EXISTS transfer_requests_pending_uniq
  ON transfer_requests (zone_id) WHERE status = 'pending';

-- ─────────────────────────── subdomains ──────────────────────────
-- Поддомены живут в отдельном контракте JustTLDSubdomains (см. docs/SUBDOMAINS.md):
-- зоны — в реестре, поддомены — в нём. Кэш здесь повторяет состояние контракта.
CREATE TABLE IF NOT EXISTS subdomains (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  tld                text NOT NULL,
  label              text NOT NULL,
  owner_address      text NOT NULL,
  zone_owner_address text NOT NULL,
  status             zone_status NOT NULL DEFAULT 'active',
  registered_at      timestamptz NOT NULL,
  expires_at         timestamptz NOT NULL,
  metadata           text NOT NULL DEFAULT '',
  transaction_hash   text NOT NULL,
  block_number       bigint NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subdomains_name_fmt  CHECK (name ~ '^[a-z0-9-]{1,32}\.[a-z0-9-]{2,19}$'),
  CONSTRAINT subdomains_label_fmt CHECK (label ~ '^[a-z0-9-]{1,32}$'),
  CONSTRAINT subdomains_tld_fmt   CHECK (tld ~ '^\.[a-z0-9-]{2,19}$'),
  CONSTRAINT subdomains_owner_fmt CHECK (owner_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT subdomains_tx_fmt    CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS subdomains_name_key       ON subdomains (name);
CREATE INDEX IF NOT EXISTS subdomains_tld_idx               ON subdomains (tld);
CREATE INDEX IF NOT EXISTS subdomains_owner_idx             ON subdomains (owner_address);
CREATE INDEX IF NOT EXISTS subdomains_status_expires_idx    ON subdomains (status, expires_at);
CREATE INDEX IF NOT EXISTS subdomains_name_trgm_idx         ON subdomains USING gin (name gin_trgm_ops);

-- ─────────────────────── subdomain_events ────────────────────────
CREATE TABLE IF NOT EXISTS subdomain_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subdomain_id     uuid NOT NULL REFERENCES subdomains (id) ON DELETE CASCADE,
  name             text NOT NULL,
  event_type       text NOT NULL,
  actor_address    text NOT NULL,
  transaction_hash text NOT NULL,
  block_number     bigint NOT NULL,
  log_index        int NOT NULL DEFAULT 0,
  details          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subdomain_events_type_chk CHECK (
    event_type IN ('registered', 'transferred', 'renewed', 'metadata_updated', 'blocked', 'unblocked')
  )
);
CREATE INDEX IF NOT EXISTS subdomain_events_sub_idx ON subdomain_events (subdomain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subdomain_events_actor_idx ON subdomain_events (actor_address);
CREATE UNIQUE INDEX IF NOT EXISTS subdomain_events_log_key
  ON subdomain_events (transaction_hash, log_index);

-- ─────────────────────── indexer служебные ───────────────────────
CREATE TABLE IF NOT EXISTS indexer_checkpoints (
  id               int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_block       bigint NOT NULL DEFAULT 0,
  last_block_hash  text NOT NULL DEFAULT '',
  chain_id         bigint NOT NULL,
  contract_address text NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS processed_logs (
  transaction_hash text NOT NULL,
  log_index        int NOT NULL,
  block_number     bigint NOT NULL,
  block_hash       text NOT NULL,
  event_name       text NOT NULL,
  processed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (transaction_hash, log_index)
);
CREATE INDEX IF NOT EXISTS processed_logs_block_idx ON processed_logs (block_number);

-- ───────────────────────────── audit ─────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_address    text NOT NULL,
  action           text NOT NULL,
  target           text,
  transaction_hash text,
  ip               text,
  user_agent       text,
  details          jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome          text NOT NULL DEFAULT 'success',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx   ON admin_audit_log (actor_address);

-- ─────────────────── auth nonces (анти-replay) ───────────────────
CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce      text PRIMARY KEY,
  address    text NOT NULL,
  issued_at  timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX IF NOT EXISTS auth_nonces_expires_idx ON auth_nonces (expires_at);

-- ───────────── intent'ы для prepare-* (одноразовые) ──────────────
CREATE TABLE IF NOT EXISTS tx_intents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action        text NOT NULL,
  sender        text NOT NULL,
  tld           text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS tx_intents_expires_idx ON tx_intents (expires_at);

-- ─────────── команды индексатору (например, полный resync) ─────────
CREATE TABLE IF NOT EXISTS indexer_commands (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command      text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  result       text
);
CREATE INDEX IF NOT EXISTS indexer_commands_pending_idx
  ON indexer_commands (created_at) WHERE processed_at IS NULL;

-- ─────────────────────── миграции (версии) ───────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- ══════════ V2: аккаунты, магазин, платежи, хостинг сайтов и DNS ══════════

-- Встроенные аккаунты (Email + пароль) для покупателей без MetaMask.
CREATE TABLE IF NOT EXISTS accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  password_hash  text NOT NULL,
  wallet_address text NOT NULL,
  display_name   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_wallet_fmt CHECK (wallet_address ~ '^0x[0-9a-f]{40}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_key  ON accounts (email);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_wallet_key ON accounts (wallet_address);

-- Настройки тарифов магазина (JSON по ключу 'pricing').
CREATE TABLE IF NOT EXISTS store_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Витрина зон и готовых поддоменов, выставленных администратором на продажу.
CREATE TABLE IF NOT EXISTS store_listings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tld           text NOT NULL,
  sub_label     text NOT NULL DEFAULT '',
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  price_rub     numeric(12, 2) NOT NULL,
  price_usdt    numeric(12, 4) NOT NULL,
  period_days   int NOT NULL DEFAULT 365,
  status        text NOT NULL DEFAULT 'available',
  buyer_address text,
  sold_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_listings_status_chk CHECK (status IN ('available', 'sold', 'hidden')),
  CONSTRAINT store_listings_tld_fmt    CHECK (tld ~ '^\.[a-z0-9-]{2,19}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS store_listings_asset_key ON store_listings (tld, sub_label);
CREATE INDEX IF NOT EXISTS store_listings_status_idx ON store_listings (status, created_at DESC);

-- Заказы на оплату через ЮMoney (RUB) и @CryptoBot (USDT / TON / BTC / ETH).
CREATE TABLE IF NOT EXISTS payment_orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_address text NOT NULL,
  buyer_email  text,
  tld          text NOT NULL,
  sub_label    text NOT NULL DEFAULT '',
  kind         text NOT NULL,
  listing_id   uuid REFERENCES store_listings (id) ON DELETE SET NULL,
  provider     text NOT NULL,
  currency     text NOT NULL,
  amount       text NOT NULL,
  status       text NOT NULL DEFAULT 'pending',
  external_id  text,
  pay_url      text,
  tx_hash      text,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  paid_at      timestamptz,
  fulfilled_at timestamptz,
  CONSTRAINT payment_orders_kind_chk CHECK (kind IN ('listing', 'custom_zone', 'custom_subdomain', 'renewal')),
  CONSTRAINT payment_orders_provider_chk CHECK (provider IN ('yoomoney', 'cryptobot', 'sandbox')),
  CONSTRAINT payment_orders_status_chk CHECK (status IN ('pending', 'paid', 'fulfilled', 'expired', 'failed'))
);
CREATE INDEX IF NOT EXISTS payment_orders_buyer_idx ON payment_orders (buyer_address, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_orders_ext_idx   ON payment_orders (provider, external_id);
CREATE INDEX IF NOT EXISTS payment_orders_status_idx ON payment_orders (status, created_at DESC);

-- Платформенные права на купленные зоны и поддомены (работают даже без газа/кошелька).
CREATE TABLE IF NOT EXISTS zone_custody (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tld           text NOT NULL,
  sub_label     text NOT NULL DEFAULT '',
  owner_address text NOT NULL,
  source        text NOT NULL DEFAULT 'order',
  order_id      uuid REFERENCES payment_orders (id) ON DELETE SET NULL,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zone_custody_owner_fmt CHECK (owner_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT zone_custody_source_chk CHECK (source IN ('order', 'admin', 'onchain'))
);
CREATE UNIQUE INDEX IF NOT EXISTS zone_custody_asset_key ON zone_custody (tld, sub_label);
CREATE INDEX IF NOT EXISTS zone_custody_owner_idx ON zone_custody (owner_address);

-- Настройки хостинга/режима отображения зоны или поддомена.
CREATE TABLE IF NOT EXISTS site_settings (
  tld          text NOT NULL,
  sub_label    text NOT NULL DEFAULT '',
  mode         text NOT NULL DEFAULT 'card',
  entry_file   text NOT NULL DEFAULT 'index.html',
  spa_fallback boolean NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tld, sub_label),
  CONSTRAINT site_settings_mode_chk CHECK (mode IN ('redirect', 'hosting', 'card'))
);

-- Файлы статических сайтов пользователей (HTML/CSS/JS/картинки) в PostgreSQL.
CREATE TABLE IF NOT EXISTS site_files (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tld        text NOT NULL,
  sub_label  text NOT NULL DEFAULT '',
  path       text NOT NULL,
  content    bytea NOT NULL,
  mime_type  text NOT NULL,
  size_bytes int NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS site_files_asset_path_key ON site_files (tld, sub_label, path);
CREATE INDEX IF NOT EXISTS site_files_asset_idx ON site_files (tld, sub_label);

-- DNS-записи (A, AAAA, CNAME, MX, TXT, NS), синхронизируемые с Cloudflare.
CREATE TABLE IF NOT EXISTS dns_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tld          text NOT NULL,
  sub_label    text NOT NULL DEFAULT '',
  record_type  text NOT NULL,
  fqdn         text NOT NULL,
  content      text NOT NULL,
  ttl          int NOT NULL DEFAULT 120,
  priority     int,
  cf_record_id text,
  owner_address text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dns_records_type_chk CHECK (record_type IN ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'))
);
CREATE INDEX IF NOT EXISTS dns_records_asset_idx ON dns_records (tld, sub_label, created_at DESC);
