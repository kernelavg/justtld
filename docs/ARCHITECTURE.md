# JustTLD — архитектура и план реализации

> **Слоган:** «Создай свою зону. Владей своим пространством.»
>
> Документ на согласование. Реализация начинается после подтверждения.

---

## 0. Проверенное окружение и технологические решения

Проверил песочницу перед проектированием, чтобы план был исполнимым, а не теоретическим:

| Проверка | Результат | Следствие для проекта |
|---|---|---|
| OS | Debian 13 (trixie), x86_64, 2 vCPU, 2 GB RAM, 21 GB free | Хватает на chain + PG + Next.js одновременно |
| Node / npm | v20.20.2 / 10.8.2 | Next.js 14/15, Hardhat 2.x, viem 2.x |
| PostgreSQL | не установлен, но есть `sudo` без пароля | Ставится через `scripts/setup-db.sh`; данные кладём в `./data/pgdata` (переживает перезапуски) |
| Docker | **отсутствует** | Никаких docker-compose. PG и chain запускаются как локальные процессы (PM2-подобный супервизор на Node) |
| Сеть | npm registry доступен | Все зависимости ставятся штатным `npm install` |

**Стек:**

- **Контракт:** Solidity `0.8.24` + OpenZeppelin Contracts `5.x` (Ownable, Pausable, ReentrancyGuard), сборка **Hardhat 2.22** + `hardhat-toolbox`.
- **Локальная EVM:** `hardhat node` — реальный узел, chainId **31337**, RPC `http://127.0.0.1:8545`, блоки майнятся на каждую транзакцию. Никаких mock-сетей.
- **Обозреватель блоков:** собственный лёгкий explorer внутри Next.js (`/explorer`, `/tx/[hash]`, `/address/[addr]`, `/block/[n]`) — читает данные **напрямую из RPC** (`eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_getBlockByNumber`), плюс ссылки совместимы с Blockscout/Etherscan-подобными UI. Опционально: если в `.env` задан `EXPLORER_TX_URL_TEMPLATE`, ссылки в UI ведут во внешний обозреватель.
- **БД:** PostgreSQL 16/17, доступ через `pg` (node-postgres) + собственный типизированный слой запросов и SQL-миграции. Без ORM-магии, чтобы поведение было предсказуемым и проверяемым.
- **Indexer:** отдельный долгоживущий процесс (Node + tsx), state machine с чекпоинтами и идемпотентной записью.
- **Веб:** Next.js 15 (App Router) + TypeScript strict + Tailwind CSS + shadcn/ui (Radix).
- **Кошелёк:** viem + EIP-1193 (`window.ethereum`, MetaMask/Coinbase/Rabby) как основной путь; **dev-подписант** (см. §9.1) для демонстрации в песочнице — тоже настоящая подпись и настоящая транзакция, просто ключ из публично известного набора тестовых аккаунтов Hardhat.
- **Тесты:** Hardhat/Mocha+Chai (контракт), Vitest (indexer, API, UI через React Testing Library), сквозной сценарий — real chain + real PG + HTTP API.
- **Качество:** ESLint, Prettier, `tsc --noEmit` в strict, GitHub Actions (lint → typecheck → test → build).

---

## 1. Архитектура

```
                        ┌──────────────────────────────────────────┐
                        │            Браузер пользователя          │
                        │  Next.js UI  +  кошелёк (EIP-1193)       │
                        └───────┬───────────────────────┬──────────┘
             REST (fetch, CSRF) │                       │ подпись tx / personal_sign
                                ▼                       ▼
┌───────────────────────────────────────────┐   ┌──────────────────────────────┐
│  Next.js server (route handlers / API)    │   │  Hardhat Node (EVM)          │
│  Zod-валидация, rate limit, auth-сессии   │   │  chainId 31337, RPC :8545    │
│  prepare-* → возвращает НЕПОДПИСАННУЮ tx  │   │  JustTLDRegistry.sol         │
└──────┬──────────────────────┬─────────────┘   └───────┬──────────────────────┘
       │ SQL (pg pool)        │ чтение chain (viem)       │ eth_getLogs (poll 1s)
       ▼                      │                           ▼
┌──────────────────────┐      │              ┌────────────────────────────────────┐
│  PostgreSQL          │◄─────┴──────────────┤  Indexer (отдельный процесс)       │
│  zones / users /     │                     │  чекпоинт в БД, reorg-safe,        │
│  zone_events /       │                     │  идемпотентный upsert, resync      │
│  transfer_requests / │                     └────────────────────────────────────┘
│  admin_audit_log     │
└──────────────────────┘
```

**Блокчейн — источник истины.** PostgreSQL — кэш для поиска/истории/аналитики.
Правила, которые зашиты в код, а не в комментарии:

1. Любая мутация (`register/transfer/renew/setMetadata/block/unblock`) — только транзакция в EVM, подписанная кошельком. Сервер **никогда** не подписывает пользовательские операции и **не хранит** приватных ключей и seed-фраз.
2. Ссылка на tx — `transactionHash` (`0x…`, 64 hex символа), поэтому все записи в Pending хранятся как «оптимистичные намерения» только в UI-состоянии; в БД зона появляется **только** после того, как indexer увидел событие в блоке.
3. Любая серверная проверка прав (`prepare-transfer`, `prepare-renewal`, админка) идёт через `eth_call` к контракту (`ownerOf`, `isBlocked`, `paused`) — БД не является аргументом.
4. Одна и та же операция, отправленная дважды (replay), не проходит: контракт отвергает по состоянию, а сервер выдаёт одноразовый `intentId` + `expiresAt` + `chainId` и сверяет их при финализации.
5. Если БД и chain расходятся — расхождение лечится `npm run indexer:resync`, а не ручной правкой строк.

**Потоки:**

- *Регистрация:* UI → `POST /api/zones/prepare-registration` (валидация+проверка chain) → кошелёк подписывает `registerTLD` → tx в блоке → событие `TLDRegistered` → indexer пишет `zones` + `zone_events` → UI поллит `/api/zones/:tld` и показывает `confirmed` + ссылку на tx.
- *Продление/передача/метаданные:* аналогично, с предварительной проверкой владельца в контракте.
- *Админ-блокировка:* вход по подписи (`SIWE`-подобная сессия), роль = `OWNER_ADDRESS` из `.env`, каждая операция пишется в `admin_audit_log`, затем реальная tx `blockTLD`.

**Структура монорепо:**

```
justtld/
├─ contracts/                 # Solidity + Hardhat
│  ├─ contracts/JustTLDRegistry.sol
│  ├─ test/JustTLDRegistry.test.ts
│  ├─ scripts/deploy.ts
│  ├─ ignition? (нет — свой детерминированный deploy + artifacts/zones.json)
│  └─ hardhat.config.ts
├─ packages/
│  ├─ shared/                 # Zod-схемы, валидатор TLD (одна реализация для web/api), ABI, типы
│  ├─ db/                     # пул, миграции, репозитории
│  └─ indexer/                # процесс синхронизации
├─ apps/web/                  # Next.js (UI + API routes + explorer)
├─ scripts/                   # setup-db.sh, start-all.mjs, healthcheck, backup/restore
├─ data/                      # pgdata, backups (в .gitignore)
├─ docs/
└─ .github/workflows/ci.yml
```

---

## 2. Смарт-контракт `JustTLDRegistry.sol`

Solidity `0.8.24`, SPDX MIT, NatSpec на каждый публичный член.

### 2.1 Состояние

```solidity
struct Zone {
    address owner;         // текущий владелец
    uint64  registeredAt;  // timestamp первой регистрации
    uint64  expiresAt;     // registeredAt + 365 days (+365d за каждое продление)
    uint64  updatedAt;     // последняя мутация
    bool    blocked;       // заморозка: нельзя transfer/renew/setMetadata
    string  metadata;      // произвольная строка (URI/JSON, ≤512 байт)
}

mapping(string => Zone)    private _zones;     // ключ — нормализованный ".tld"
string[]                   private _allTlds;   // реестр для totalZones()/пагинации
mapping(string => bool)    private _reserved;  // + чёрный список как отдельная мапа
mapping(string => bool)    private _blacklisted;

uint64 public constant REGISTRATION_PERIOD = 365 days;
uint256 public constant MIN_TLD_LENGTH = 3;   // вместе с точкой
uint256 public constant MAX_TLD_LENGTH = 21;
uint256 public constant MAX_METADATA_LENGTH = 512;
```

### 2.2 Публичный интерфейс (все требуемые + вспомогательные)

| Функция | Модификаторы / права | Поведение |
|---|---|---|
| `registerTLD(string tld, string metadata)` | `whenNotPaused nonReentrant` | Валидирует, запрещает дубль/резерв/blacklist, `owner = msg.sender`, `expiresAt = now + 365 days`, событие |
| `transferTLD(string tld, address newOwner)` | `whenNotPaused nonReentrant` + только владелец зоны | `newOwner != 0`, `!= текущий`, зона не заблокирована; `registeredAt` сохраняется, `expiresAt` **не** сбрасывается |
| `renewTLD(string tld)` | `whenNotPaused nonReentrant` + только владелец | `expiresAt = max(now, expiresAt) + 365 days` (раннее продление не сгорает), блокировка запрещает |
| `setTLDMetadata(string tld, string metadata)` | `whenNotPaused nonReentrant` + только владелец | блокировка запрещает, лимит `MAX_METADATA_LENGTH` |
| `getTLD(string tld)` → `(address,uint64,uint64,uint64,bool,string)` | `view` | `TLDNotFound` если нет |
| `ownerOf(string tld)` → `address` | `view` | `TLDNotFound` если нет |
| `exists(string tld)` → `bool` | `view` | true и для истёкших, и для заблокированных |
| `totalZones()` → `uint256` | `view` | `_allTlds.length` |
| `blockTLD(string tld, string reason)` | `onlyOwner` | `TLDIsBlocked` при повторе; причина в событии |
| `unblockTLD(string tld)` | `onlyOwner` | |
| `pause()` / `unpause()` | `onlyOwner` | OZ `Pausable`; блокирует register/transfer/renew/setMetadata, чтение работает |
| `isExpired(tld)` / `isBlocked(tld)` / `isAvailable(tld)` | `view` | для UI и API |
| `tldsOfOwner(address)` → `string[]` | `view` | личный кабинет без выкачивания всех событий |
| `addReservedTLD/removeReservedTLD(string)` | `onlyOwner` | настраиваемый список резервов поверх встроенного |
| `addBlacklistedWord/removeBlacklistedWord(string)` | `onlyOwner` | подстроки оскорбительных/опасных названий |

### 2.3 Валидация TLD (единая для chain и API)

```
1. пустая строка                       → InvalidTLD("empty")
2. bytes[0] != '.'                     → InvalidTLD("must start with dot")
3. len(tld) < 3 || len(tld) > 21 (байты) → InvalidTLD("length 3..21")
   (".myzone" = 7 ✔, ".a" = 2 ✘, ".abcdefghijklmnopqrstu" = 22 ✘)
4. label = lowercase(tld[1:]) и нормализация всего ключа в lower-case
   → ".MyZone" и ".myzone" — одна и та же зона (нельзя занять обе)
5. только [a-z0-9-] в label           → InvalidTLD("invalid character")
6. label[0] == '-' || label[-1] == '-' → InvalidTLD("hyphen at edge")
7. содержит "--"                      → InvalidTLD("double hyphen")
8. встроенный резерв: eth, com, net, org, gov, edu, io, ai, sol (+ on-chain настраиваемые)
   → TLDReserved
9. blacklist (подстроки, on-chain настраиваемые, напр. "scam", "phish", "fuck")
   → TLDBlacklisted
10. _zones[key] уже существует        → TLDAlreadyExists   (перерегистрация запрещена всегда,
                                        в т.ч. для истёкших: срок истечения — флаг в UI/indexer)
```

### 2.4 События (все `indexed` где имеет смысл)

```solidity
event TLDRegistered(string indexed tld, address indexed owner, uint64 expiresAt, string metadata, uint64 timestamp);
event TLDTransferred(string indexed tld, address indexed from, address indexed to, uint64 timestamp);
event TLDRenewed(string indexed tld, address indexed owner, uint64 newExpiresAt, uint64 timestamp);
event TLDMetadataUpdated(string indexed tld, address indexed owner, string metadata, uint64 timestamp);
event TLDBlocked(string indexed tld, string reason, address indexed by, uint64 timestamp);
event TLDUnblocked(string indexed tld, address       by, uint64 timestamp);
// служебные: ReservedTLDAdded/Removed, BlacklistWordAdded/Removed
```

Замечание: у `string indexed` в логах лежит keccak-хеш; маршрутизация indexer'а идёт по **`address + topics[0]`**, а сами значения `tld/metadata` читаются из `data` (и сверяются с `eth_call getTLD` — защита от подделки логов).

### 2.5 Custom errors

```solidity
error InvalidTLD(string reason);
error TLDAlreadyExists(string tld);
error TLDNotFound(string tld);
error NotTLDOwner(string tld, address caller);
error TLDIsBlocked(string tld);
error TLDReserved(string tld);
error TLDBlacklisted(string tld);
error ZeroAddress();
error InvalidNewOwner(address newOwner);
error MetadataTooLong(uint256 length, uint256 max);
error EmptyReason();
```

Плюс `OwnableUnauthorizedAccount`, `OwnableInvalidOwner`, `EnforcedPause`, `ExpectedPause`, `ReentrancyGuardReentrantCall` из OZ 5.

---

## 3. Схема базы данных (PostgreSQL)

Расширения: `pgcrypto` (для `gen_random_uuid()`), `pg_trgm` (поиск по TLD/владельцу). Все временные метки — `timestamptz`.

```sql
-- users
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  text NOT NULL,                       -- 0x-hex, lower-case
  display_name    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_wallet_checksum CHECK (wallet_address ~ '^0x[0-9a-f]{40}$')
);
CREATE UNIQUE INDEX users_wallet_address_key ON users (wallet_address);

-- zones  (кэш состояния контракта)
CREATE TYPE zone_status AS ENUM ('active', 'expired', 'blocked');
CREATE TABLE zones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tld             text NOT NULL,                        -- '.myzone', lower-case, с точкой
  owner_address   text NOT NULL,
  status          zone_status NOT NULL DEFAULT 'active',
  registered_at   timestamptz NOT NULL,
  expires_at      timestamptz NOT NULL,
  metadata        text NOT NULL DEFAULT '',
  transaction_hash text NOT NULL,
  block_number    bigint NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zones_tld_fmt  CHECK (tld ~ '^\.[a-z0-9-]{2,20}$'),
  CONSTRAINT zones_owner_fmt CHECK (owner_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT zones_tx_fmt   CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX zones_tld_key            ON zones (tld);
CREATE INDEX        zones_owner_idx          ON zones (owner_address);
CREATE INDEX        zones_status_expires_idx ON zones (status, expires_at);
CREATE INDEX        zones_tld_trgm_idx       ON zones USING gin (tld gin_trgm_ops);
CREATE INDEX        zones_meta_trgm_idx      ON zones USING gin (metadata gin_trgm_ops);

-- zone_events (полная история из логов)
CREATE TABLE zone_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id         uuid NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  event_type      text NOT NULL,   -- registered|transferred|renewed|metadata_updated|blocked|unblocked
  actor_address   text NOT NULL,
  transaction_hash text NOT NULL,
  block_number    bigint NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX zone_events_zone_created_idx ON zone_events (zone_id, created_at DESC);
CREATE UNIQUE INDEX zone_events_log_key   ON zone_events (transaction_hash, block_number, event_type, (details->>'logIndex'));
CREATE INDEX zone_events_actor_idx        ON zone_events (actor_address);

-- transfer_requests (намерение + финализация по chain)
CREATE TYPE transfer_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');
CREATE TABLE transfer_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id         uuid NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  from_address    text NOT NULL,
  to_address      text NOT NULL,
  status          transfer_status NOT NULL DEFAULT 'pending',
  transaction_hash text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  CONSTRAINT transfer_diff_addresses CHECK (from_address <> to_address)
);
CREATE INDEX transfer_requests_zone_idx   ON transfer_requests (zone_id);
CREATE INDEX transfer_requests_status_idx ON transfer_requests (status);
CREATE UNIQUE INDEX transfer_requests_pending_uniq
  ON transfer_requests (zone_id) WHERE status = 'pending';

-- служебные таблицы (нужны для надёжности, не вместо требуемых)
CREATE TABLE indexer_checkpoints (
  id              int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_block      bigint NOT NULL DEFAULT 0,
  last_block_hash text   NOT NULL DEFAULT '',
  chain_id        bigint NOT NULL,
  contract_address text  NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE processed_logs (           -- идемпотентность и защита от потерь
  transaction_hash text   NOT NULL,
  log_index        int    NOT NULL,
  block_number     bigint NOT NULL,
  block_hash       text   NOT NULL,
  event_name       text   NOT NULL,
  processed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (transaction_hash, log_index)
);

CREATE TABLE admin_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_address   text NOT NULL,
  action          text NOT NULL,          -- block|unblock|resync|pause|unpause
  target          text,                   -- '.zone'
  transaction_hash text,
  ip              inet,
  user_agent      text,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome         text NOT NULL,          -- success|failure
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_nonces (               -- анти-replay для входа
  nonce      text PRIMARY KEY,
  address    text NOT NULL,
  issued_at  timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
```

Кэш-семантика:
- `zones.status` пересчитывается indexer'ом (`active` → `expired` по `expires_at`, `blocked` по событиям) и **всегда** может быть перезаписан `resync`.
- `zone_events` + `processed_logs` — журнал, из которого можно восстановить `zones` целиком (`npm run indexer:resync --purge`).
- `transfer_requests` создаёт API при `prepare-transfer`; закрывает indexer при `TLDTransferred` (или `failed` при revert/non-inclusion по таймауту).

---

## 4. Страницы (Next.js App Router)

| Роут | Содержимое |
|---|---|
| `/` | Hero со слоганом, поиск зоны с live-проверкой доступности (`/api/search`), статистика (всего зон, активных, заблокированных, истекающих за 30 дней), последние регистрации из индексатора, CTA «Подключить кошелёк» |
| `/zones` | Каталог: поиск, фильтры (все / активные / истекающие / заблокированные, «мои зоны»), сортировка (новые, AZ, по дате истечения), пагинация, состояние empty/loading/error |
| `/zone/[tld]` | Владелец (адрес + ENS-подобное сокращение), статус, `registeredAt`, `expiresAt` + countdown, metadata, история событий, ссылка на tx/блок, кнопки Transfer/Renew/Edit metadata (только владельцу), «заблокировано владельцем контракта» — красный баннер |
| `/register` | Ввод зоны с живой валидацией (те же правила, что в контракте), выпадающий превью доступности, поле metadata, итоговая цена = только gas, шаг «подпишите в кошельке», статусы pending/confirmed/failed, ссылка на tx в explorer |
| `/dashboard` | Мои зоны (`tldsOfOwner` + БД), счётчики, даты истечения, быстрые действия (Renew, Transfer, Metadata), история операций, сводка по gas |
| `/admin` | Доступ только `OWNER_ADDRESS` (проверка подписи + серверная проверка). Блокировка/разблокировка зон с причиной, pause/unpause, blacklist/reserved-списки, `resync` индексатора, лента аудита, статус контракта/индексатора |
| `/docs` | Документация: как работает, правила TLD, адреса контракта/RPC, API-справочник, FAQ |
| `/explorer`, `/tx/[hash]`, `/address/[addr]`, `/block/[n]` | Реальный обозреватель на RPC-данных |

Глобально: `next-themes` (тёмная/светлая/системная), `next-intl` или собственный i18n-словарь (RU/EN, переключение в хедере, `?lang=`+cookie), мобильная адаптация (Tailwind breakpoints, drawer-меню), toast-уведомления, компоненты shadcn/ui (`button, input, card, dialog, table, badge, tabs, alert, select, dropdown-menu, skeleton, sonner`).

Кошелёк: провайдер (`wagmi`-совместимый собственный контекст на viem), переключение сети на chainId 31337, `watchAsset`-подсказка, обработка `UserRejectedRequestError` (понятное сообщение «Транзакция отклонена в кошельке»), обработка «недостаточно средств на gas», отслеживание `pending → confirmed/failed` по receipt, отображение причины revert через `simulateContract` (декодирование custom errors).

---

## 5. API (Next.js route handlers)

Все ответы — JSON, ошибки единого формата `{ error: { code, message, details? } }`, все входы — Zod, все денежные/чувствительные операции — с rate limit.

| Метод и путь | Назначение | Вход / выход (кратко) |
|---|---|---|
| `GET /api/zones` | Пагинированный список из БД | `?page&limit&status&owner&sort` → `{ items: Zone[], total, page, limit }` |
| `GET /api/zones/:tld` | Одна зона: БД-cache + **сверка с chain** (`getTLD`) | → `{ zone, chain: {...}, consistent: bool }`; 404 если нет |
| `GET /api/zones/:tld/history` | История событий | `?page&limit&type` → `{ items: ZoneEvent[] }` |
| `GET /api/stats` | Аналитика | → `{ total, active, expired, blocked, expiringIn30d, totalRenewals, uniqueOwners, lastIndexedBlock, chainHead, lag }` |
| `GET /api/search?q=` | Поиск по tld/owner/metadata + подсказка доступности | → `{ results: Zone[], availability: { tld, available, reason } }` |
| `GET /api/health` | Живость: DB ping, RPC ping, indexer lag, контракт-код на адресе, версия | 200/503 с детализацией |
| `POST /api/zones/prepare-registration` | Валидация + проверка chain → неподписанная tx | `{ tld, metadata }` → `{ tx: {to,data,chainId,gas}, intentId, expiresAt, warnings[] }` |
| `POST /api/zones/prepare-transfer` | Проверка владельца в контракте → tx + запись `transfer_requests(pending)` | `{ tld, to, signature? }` → `{ tx, transferRequestId }` |
| `POST /api/zones/prepare-renewal` | Проверка владельца/блокировки → tx | `{ tld }` → `{ tx, newExpiresAt }` |
| `POST /api/admin/zones/:tld/block` | Только админ-сессия: аудит-лог + подготовка tx `blockTLD` | `{ reason }` → `{ tx, auditId }`; 401/403 иначе |
| `POST /api/admin/zones/:tld/unblock` | То же для `unblockTLD` | → `{ tx, auditId }` |
| `POST /api/auth/nonce` | Nonce для входа по подписи | `{ address }` → `{ nonce, message, expiresAt }` |
| `POST /api/auth/verify` | Проверка `personal_sign` (viem `verifyMessage`), выдача httpOnly-сессии | `{ address, signature, nonce }` → cookie + `{ address, role }` |
| `POST /api/auth/logout` | Сброс сессии | → `{ ok: true }` |
| `POST /api/admin/pause`, `/unpause`, `/blacklist`, `/reserved`, `/resync` | Админ-операции с аудитом | → `{ tx }` / `{ ok }` |

Отдельно `GET /api/contracts` (адрес, chainId, ABI-хэш) для UI и `GET /api/openapi` (машинночитаемая схема) — по желанию, если останется время.

Дополнительно: `prepare-*` возвращают **только** неподписанную транзакцию — подпись происходит исключительно в кошельке. Сервер дополнительно отдаёт `intentId` (одноразовый, TTL 10 мин, хранится в БД) и `expectedSender` (адрес из сессии/заголовка), чтобы после отправки UI мог подтвердить, что tx отправил именно тот адрес.

---

## 6. Indexer

Процесс `packages/indexer`:

1. Читает конфиг: `RPC_URL`, `CHAIN_ID`, `REGISTRY_ADDRESS`, `START_BLOCK` (из `deployments/*.json`), `POLL_INTERVAL_MS=1000`, `CONFIRMATIONS=1` (локальная сеть мгновенная, но параметр есть — безопасно для тестовой сети), `BATCH_SIZE=2000`.
2. Состояние — `indexer_checkpoints` в БД (**не в памяти**), поэтому рестарт безопасен.
3. Цикл: `chainHead` → если `last_block + 1 <= head - CONFIRMATIONS` → `eth_getLogs(from=last_block+1, to=min(head, from+BATCH))` по адресу контракта и списку `topics[0]`.
4. Для каждого лога: проверка `blockHash` (reorg-детект: если сохранённый хеш блока не совпал — откат на `N-12` и повторная обработка диапазона), запись в `processed_logs` (`ON CONFLICT DO NOTHING`) → идемпотентность.
5. Применение события в одной транзакции БД: `upsert zone` (по `tld`), `insert zone_event`, `update transfer_requests` при `TLDTransferred`, `insert user` при первой активности адреса.
6. `last_block` обновляется **в той же транзакции**, что и данные → нет «дыр».
7. Раз в 15 с: пересчёт `status` для истёкших зон, обновление in-memory кэша статистики (инвалидация по `NOTIFY justtld_events` — Next.js подписан на LISTEN, чтобы UI-статистика была свежей).
8. `npm run indexer:resync` — `--purge` (очистка `zones/zone_events/processed_logs`, чекпоинт в 0) или `--from <block>`; `--dry-run` — сверка `totalZones()`/`ownerOf()` по всем зонам против chain без записи.
9. `--once` — обработка текущего диапазона и выход (используется в тестах и в CI).
10. Graceful shutdown по SIGINT/SIGTERM (дописывает текущую пачку, коммитит чекпоинт).

---

## 7. Безопасность

| Угроза | Мера |
|---|---|
| Утечка ключей | Ключи не хранятся и не логируются; сервер не имеет подписывающего кошелька для пользовательских операций. В репозитории — только публичные тестовые ключи Hardhat (`#0`, широко известны), помечены как dev-only |
| Подмена владельца | Все права проверяются через `eth_call` (`ownerOf`, `paused`, `isBlocked`); после отправки tx — сверка receipt + адреса отправителя |
| XSS | React-экранирование, никакого `dangerouslySetInnerHTML`, metadata выводится как текст; строгая CSP (`script-src 'self'`, nonce), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| CSRF | Сессия — `httpOnly; SameSite=Strict; Secure` cookie + double-submit CSRF-токен на всех mutating-запросах; проверка `Origin`/`Sec-Fetch-Site` |
| SSRF | Никаких пользовательских URL на сервере; `RPC_URL` и `EXPLORER_*` только из env и валидируются на `http(s)` + разрешённые хосты; metadata не фетчится сервером |
| SQL-инъекции | Только параметризованные запросы `pg` ($1..$n), сортировки — из whitelist-мапы, `LIMIT` ограничен |
| Replay | Nonce на вход + одноразовые `intentId` c TTL + проверка `chainId` и `expectedSender`; контракт отвергает повторные мутации по состоянию |
| Rate limiting | Скользящее окно на IP+роут: `/api/auth/*` 10/мин, `prepare-*` 20/мин, `admin` 10/мин, чтение 120/мин; 429 с `Retry-After`. Хранилище — in-memory LRU с опцией Redis-совместимого апгрейда |
| Админка | `auth/verify` → подписанная httpOnly-сессия (JWT HS256, секрет из env) → серверная проверка `session.address === OWNER_ADDRESS`; UI-скрытие кнопок — только косметика |
| Аудит | `admin_audit_log` пишет каждое действие админа: кто, что, tx hash, IP, UA, результат |
| Ошибки кошелька | Отдельные сообщения: отклонено пользователем, нет провайдера, неверная сеть, недостаточно gas, revert с декодированным custom error |
| Заголовки/лимиты | `middleware.ts`: body-size limit, security-заголовки, redirect http→https (в prod) |

---

## 8. Тесты и CI

**Контракт (Hardhat, ~30 кейсов):** валидная регистрация; доступность через `exists`/`getTLD`; все отказы валидации (нет точки, длина 2/22, верхний регистр → нормализация, `a--b`, крайние дефисы, спецсимволы, UTF-8); резервные зоны; blacklist-подстроки; повторная регистрация; передача владельцем; отказ не-владельцу и `address(0)`; перенос `registeredAt` при передаче; продление владельцем / отказ чужому / `expiresAt` увеличивается ровно на 365 дней и не сгорает при раннем продлении; блокировка владельцем контракта, запрет transfer/renew заблокированной, разблокировка; `pause` блокирует мутации; `totalZones`; metadata + лимит; **проверка событий** (все 6, с аргументами и `indexed`); gas-снапшоты (опционально).

**Indexer:** запуск против реального Hardhat node + реального PostgreSQL; последовательное применение событий; идемпотентность при повторном прогоне (дублей нет); рестарт с сохранённого чекпоинта; `--purge` и повторная синхронизация с нуля даёт идентичный результат; блок с несколькими событиями; блокировка/истечение → `status`.

**API:** все 11 требуемых эндпоинтов — успех и ошибки (400 Zod, 404, 409 «зона занята», 401/403 на админке, 429 при rate limit); `prepare-transfer` от не-владельца; `prepare-*` возвращают валидную tx-структуру; CSRF-отказ; audit-лог после админ-действия.

**UI (React Testing Library + Vitest):** проверка доступности зоны в форме; блокировка кнопки при невалидном вводе; отображение pending → confirmed; сообщение при отклонённой транзакции; рендер страницы зоны с владельцем; фильтры каталога; переключение RU/EN и темы.

**E2E-прогон (демонстрация из §10):** скрипт `npm run verify:e2e` на реальной сети и реальной БД: регистрация → блок → лог → БД → API → передача → продление → повторная регистрация отклонена.

**CI (`.github/workflows/ci.yml`):** сервисы `postgres:16`; шаги `npm ci` → `lint` → `typecheck` → `hardhat test` → `indexer/api/ui tests` → `next build`. Плюс `npm run verify:manifests` (нет `console.log`-секретов, `.env` не в git).

---

## 9. Важные проектные решения (прошу согласовать)

1. **Кошелёк в этой песочнице.** Превью открывается в sandboxed iframe, куда расширения (MetaMask) не инжектят провайдера, а страница живёт на чужом origin. Поэтому:
   - основной путь — настоящий EIP-1193 (`window.ethereum`) для реального браузера;
   - для демонстрации здесь — **dev-подписант**: в UI кнопка «Dev Wallet» подключает один из публичных тестовых аккаунтов Hardhat (ключ вводится пользователем или берётся из `NEXT_PUBLIC_DEV_KEYS`), подпись и tx формируются viem'ом и уходят в реальный узел. Это не фикция, но и не «настоящий MetaMask» — ключ живёт в памяти вкладки, никогда не уходит на сервер.
   - Кнопка «Dev Wallet» и такие env не собираются в production-сборку (`NODE_ENV !== 'production'` / `NEXT_PUBLIC_ENABLE_DEV_WALLET=true`).
2. **Истечение зоны** не освобождает имя: контракт по-прежнему владеет владелец, статус «expired» — только флаг (в БД и UI). Иначе ломается требование «повторная регистрация запрещена». Альтернатива (reclaim после истечения) — включается флагом `allowReclaim`, но по умолчанию выключена. Скажи, если нужно наоборот.
3. **Обозреватель** — собственный на RPC (Blockscout требует Docker, которого нет). Ссылки на tx будут вида `http://localhost:3000/tx/0x…`.
4. **PostgreSQL** ставится `sudo apt-get install postgresql` (скрипт `scripts/setup-db.sh`, идемпотентный), данные — в `./data/pgdata`, поэтому `pg_dump`/`pg_restore` и восстановление после перезапуска работают предсказуемо. Если на машине уже есть PG — используется `DATABASE_URL`.
5. **`npm run start:all`** — оркестратор на Node (`scripts/start-all.mjs`): проверяет и поднимает PG → ждёт готовности → `hardhat node` → `deploy` (пишет `deployments/localhost.json` c адресом и ABI) → миграции БД → indexer → Next.js, с health-чеками, цветными логами и единым `Ctrl+C` для остановки всего дерева процессов. Логи — в `logs/<сервис>.log`, PID — в `data/pids/`.

---

## 10. План запуска и проверки (что я выполню и покажу)

**Порядок работ:**

| Фаза | Действия | Проверка |
|---|---|---|
| P0 | `justtld/` скелет, npm workspaces, ESLint/Prettier/TS strict, `.env.example`, `scripts/setup-db.sh` | `npm install` без ошибок |
| P1 | `JustTLDRegistry.sol` + Hardhat + деплой-скрипт | `npx hardhat test` — все зелёные; `npm run deploy` печатает адрес |
| P2 | PostgreSQL: миграции, репозитории, seed админа | `psql` показывает 4 требуемые + служебные таблицы |
| P3 | Indexer | после регистрации зоны строка в `zones`, событие в `zone_events`, чекпоинт растёт, рестарт не теряет данные |
| P4 | API + auth + rate limit + аудит | curl-прогон всех эндпоинтов, скриншоты ответов |
| P5 | UI (7 страниц + explorer), i18n, темы, кошелёк | `next build` успешен, страницы открываются |
| P6 | Тесты (контракт/indexer/API/UI), CI | `npm test` — сводка по suites |
| P7 | `start:all`, backup/restore, blacklist, админ-передача владения, README | сквозной `verify:e2e` |

**Чек-лист приёмки — покажу фактический вывод по каждому пункту:**

1. Контракт задеплоен → адрес + `eth_getCode` непустой.
2. Кошелёк подключается → адрес в UI + `/api/auth/nonce|verify`.
3. Регистрация зоны → подписанная tx.
4. Транзакция в блоке → `eth_getTransactionReceipt` (blockNumber, status=1, gasUsed).
5. Событие `TLDRegistered` → `eth_getLogs` с декодированными аргументами.
6. Indexer → `SELECT * FROM zones` и `zone_events` в psql.
7. Страница зоны показывает владельца → HTTP 200 + скриншот/дамп текста.
8. Передача зоны → новый `ownerOf` + `TLDTransferred` + `transfer_requests.completed`.
9. Продление → `expiresAt` +365 дней.
10. Повторная регистрация отклонена → revert `TLDAlreadyExists`, tx failed, в UI понятная ошибка.
11. Тесты → итоговая сводка (`passing`, 0 failing).

**Команды (после реализации):**

```bash
npm install            # зависимости
npm run chain          # локальная EVM-сеть (:8545)
npm run deploy         # контракт + запись deployments/localhost.json
npm run indexer        # синхронизация chain → PostgreSQL
npm run dev            # Next.js (:3000)
# либо всё сразу:
npm run start:all
```

**Итоговый README** (RU + краткий EN) будет содержать: запуск/остановку/перезапуск, адрес контракта и RPC, регистрацию зоны, проверку владельца (`cast call`/UI/API), `pg_dump`-бэкап и восстановление, добавление запрещённой зоны в blacklist (on-chain `addBlacklistedWord` + UI админки), передачу владения контрактом (`transferOwnership`), troubleshooting (порт занят, PG не стартует, indexer отстаёт, кошелёк не в сети 31337).

---

## 11. Что НЕ будет делаться

- Никаких mock-блокчейнов, фейковых подписей и «нарисованных» транзакций — только реальный узел.
- Никакого Vercel/облачных деплоев, Docker-обязательных зависимостей.
- Приватные ключи и seed-фразы не хранятся, не логируются, не коммитятся.
- Вне рамок: ENS-интеграция, реальная DNS-делегация, платежи в токенах (сейчас — только gas), мультичейн.
