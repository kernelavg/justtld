# JustTLD

**«Создай свою зону. Владей своим пространством.»**

[![CI](https://github.com/kernelavg/justtld/actions/workflows/ci.yml/badge.svg)](https://github.com/kernelavg/justtld/actions/workflows/ci.yml)
[![Integration](https://github.com/kernelavg/justtld/actions/workflows/integration.yml/badge.svg)](https://github.com/kernelavg/justtld/actions/workflows/integration.yml)

> **Живой деплой в Sepolia (chainId 11155111).**
>
> | | |
> | --- | --- |
> | Контракт | [`0x040e0F550dE73Aa796131A3C503B0189303CB298`](https://sepolia.etherscan.io/address/0x040e0F550dE73Aa796131A3C503B0189303CB298#code) — Source Code Verified |
> | Владелец / админ | [`0x2ba51777889785cC53871463Bf8e4db95Fc8d886`](https://sepolia.etherscan.io/address/0x2ba51777889785cC53871463Bf8e4db95Fc8d886) |
> | Sourcify | [exact_match](https://repo.sourcify.dev/contracts/11155111/0x040e0F550dE73Aa796131A3C503B0189303CB298) (creation + runtime) |
> | Публичный сайт (PaaS) | **https://justtld.onrender.com** — Next.js + PostgreSQL (Neon) + indexer в одном контейнере |
> | Публичная страница | https://justtld.infinityfreeapp.com — статика без сервера, регистрация зон из браузера |
> | Деплой / проверка | `npm run deploy:sepolia`, `npm run verify:sepolia` |
>
> Публикация исходников, метрики газа и план перехода на основную сеть: [`docs/PUBLIC-DEPLOY.md`](docs/PUBLIC-DEPLOY.md).
> Хостинг сайта с базой: [`docs/DEPLOY-PAAS.md`](docs/DEPLOY-PAAS.md).

Децентрализованный реестр верхнеуровневых зон (TLD) на локальной EVM-сети.
Контракт — источник истины, PostgreSQL — кэш, поиск и история, indexer — мост между ними.
Всё работает локально, в терминале: без Vercel, без облачных сервисов, без моков.
Каждая операция подписывается кошельком и попадает в реальный блок.

---

## Содержание

1. [Что умеет](#1-что-умеет)
2. [Требования](#2-требования)
3. [Быстрый старт](#3-быстрый-старт)
4. [Адреса и доступы](#4-адреса-и-доступы)
5. [Как зарегистрировать зону](#5-как-зарегистрировать-зону)
6. [Как проверить владельца зоны](#6-как-проверить-владельца-зоны)
7. [Остановка и перезапуск](#7-остановка-и-перезапуск)
8. [Резервное копирование и восстановление БД](#8-резервное-копирование-и-восстановление-бд)
9. [Администратор](#9-администратор)
10. [Как добавить запрещённое слово](#10-как-добавить-запрещённое-слово)
11. [Архитектура](#11-архитектура)
12. [Контракт JustTLDRegistry](#12-контракт-justtldregistry)
13. [Правила валидации TLD](#13-правила-валидации-tld)
14. [База данных](#14-база-данных)
15. [Indexer](#15-indexer)
16. [API](#16-api)
17. [Веб-интерфейс](#17-веб-интерфейс)
18. [Резолвер имён: `myzone.вашдомен`](#175-резолвер-имён-myzoneвашдомен)
19. [Безопасность](#18-безопасность)
20. [Тесты](#19-тесты)
21. [CI](#20-ci)
22. [Переменные окружения](#21-переменные-окружения)
23. [Срок жизни зоны](#22-срок-жизни-зоны)
24. [Диагностика](#23-диагностика)
25. [Структура репозитория](#24-структура-репозитория)

---

## 1. Что умеет

- Регистрация зоны (`.myzone`) транзакцией в контракт — владельцем становится отправитель.
- Проверка доступности в реальном времени, поиск и фильтры по зонам.
- Передача зоны другому адресу, продление на 365 дней, обновление метаданных.
- Админ-панель: блокировка зоны, пауза контракта, чёрный список слов, резерв зон, полный resync.
- История каждой зоны: все события контракта, разложенные по блокам и транзакциям.
- Встроенный обозреватель: `/explorer`, `/tx/<hash>`, `/block/<n>`, `/address/<addr>`.
- Русский и английский интерфейс, тёмная/светлая тема, мобильная вёрстка.
- 97 автотестов: контракт, валидация, indexer на реальных событиях, API и UI.

## 2. Требования

| Компонент | Версия | Примечание |
| --- | --- | --- |
| Node.js | ≥ 20 (проверено на 20.20.2) | ESM + TS |
| npm | ≥ 10 | npm workspaces |
| PostgreSQL | ≥ 16 (проверено на 17.12) | локальный кластер в `./data/pgdata`, ставится скриптом `scripts/setup-db.sh` |
| Docker | **не требуется** | всё запускается как локальные процессы |

ОС: Linux (Debian/Ubuntu). На macOS работают те же команды, если `pg_ctl` доступен в `PATH`.

## 3. Быстрый старт

```bash
cd justtld
npm install          # один раз
npm run start:all    # вся система одной командой
```

`start:all` идемпотентен и по порядку:

1. создаёт `.env` из `.env.example` и генерирует `SESSION_SECRET`;
2. поднимает PostgreSQL (если кластер ещё не создан — инициализирует в `./data/pgdata`);
3. запускает локальную EVM-сеть Hardhat на `0.0.0.0:8545`;
4. деплоит `JustTLDRegistry` (если контракт уже развёрнут — переиспользует адрес);
5. применяет миграции базы;
6. запускает indexer;
7. собирает/запускает Next.js на `0.0.0.0:3000`.

По завершении печатается сводка: адрес веб-приложения, RPC URL, адрес контракта, админ-аккаунт.

> **Публичная сеть (Sepolia / Mainnet):** код уже готов к деплою вне локальной машины —
> см. `docs/PUBLIC-DEPLOY.md`. Кратко: заполнить `.env.secrets`, `npm run deploy:sepolia`,
> `npm run verify:sepolia`, `npm run net:sepolia`, затем перезапустить сервисы.

**Пошаговый запуск** (каждый сервис отдельным терминалом):

```bash
npm run chain        # 1. локальная EVM-сеть :8545 (оставить работать)
npm run db:setup     # 2. PostgreSQL (initdb при первом запуске) + миграции
npm run deploy       # 3. деплой контракта → deployments/localhost.json
npm run indexer      # 4. слушает события контракта и пишет в PostgreSQL
npm run dev          # 5. Next.js в режиме разработки :3000
```

Production-сборка веб-приложения:

```bash
npm run build && npm start          # next build && next start -H 0.0.0.0 -p 3000
MODE=prod npm run start:all         # start:all в режиме production-сборки
```

## 4. Адреса и доступы

| Что | Значение |
| --- | --- |
| Веб-приложение | <http://localhost:3000> |
| RPC URL | `http://127.0.0.1:8545` |
| chainId | `31337` |
| Контракт `JustTLDRegistry` | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| Блок деплоя | `1` |
| Владелец контракта = админ | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| PostgreSQL | `postgresql://justtld:justtld@127.0.0.1:5432/justtld` |
| Логи сервисов | `logs/chain.log`, `logs/indexer.log`, `logs/web.log`, `logs/postgres.log` |
| PID-файлы | `data/pids/*.pid` |

> Адрес контракта детерминирован для локальной сети (деплоер = первый аккаунт Hardhat, nonce 0),
> поэтому он одинаков при каждом `npm run deploy:fresh`. Актуальные значения всегда лежат
> в `deployments/localhost.json` и отдаются через `GET /api/contracts`.

Dev-аккаунты Hardhat (ключи публично известны — **только для локальной сети**):

| # | Адрес | Роль |
| --- | --- | --- |
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | владелец контракта / админ |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | тестовый пользователь |
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | тестовый пользователь |

В интерфейсе кнопка **«Dev Wallet»** подключает такой аккаунт без MetaMask: подпись и транзакция
формируются локально в браузере на известном тестовом ключе, приватный ключ никогда не уходит на сервер.
Для настоящего кошелька используется `window.ethereum` (EIP-1193), если MetaMask установлен.

## 5. Как зарегистрировать зону

**Через интерфейс**

1. Откройте <http://localhost:3000/register>.
2. Подключите кошелёк (MetaMask или Dev Wallet).
3. Введите имя — например `myzone` (валидация идёт на лету, сервер проверяет доступность).
4. Нажмите «Зарегистрировать за gas» и подтвердите транзакцию в кошельке.
5. Дождитесь статуса «Транзакция подтверждена» — появится ссылка на `/tx/<hash>`.

**Через API + кошелёк** (сервер никогда не подписывает за вас)

```bash
# 1. подготовка неподписанной транзакции
curl -s -X POST http://127.0.0.1:3000/api/zones/prepare-registration \
  -H 'content-type: application/json' \
  -d '{"tld":"myzone","metadata":"{\"site\":\"https://my.zone\"}","sender":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8"}' | jq

# 2. подпись и отправка в сети (hardhat console или ethers/viem)
npx hardhat console --network localhost
> const c = await ethers.getContractAt('JustTLDRegistry', '0x5FbDB2315678afecb367f032d93F642f64180aa3')
> await (await c.registerTLD('myzone', '{"site":"https://my.zone"}')).wait()

# 3. подтверждение для истории/кэша
curl -s -X POST http://127.0.0.1:3000/api/zones/confirm \
  -H 'content-type: application/json' -d '{"intentId":"<id из шага 1>","transactionHash":"0x…"}'
```

## 6. Как проверить владельца зоны

| Способ | Команда / адрес |
| --- | --- |
| Интерфейс | <http://localhost:3000/zone/myzone> — карточка с владельцем, статусом, сроком, историей |
| API | `curl -s http://127.0.0.1:3000/api/zones/myzone \| jq` → `zone.ownerAddress` и `chain.owner` |
| История | `curl -s http://127.0.0.1:3000/api/zones/myzone/history \| jq` |
| Контракт (истина) | `npx hardhat console --network localhost` → `await c.ownerOf('myzone')` |
| Обозреватель | `/address/0x…` — все зоны адреса; `/tx/0x…` — детали транзакции |

Ответ `GET /api/zones/:tld` содержит **и** кэш (`zone`), **и** данные из контракта (`chain`):
если они расходятся, `consistent: false` — значит indexer отстал, а истина всегда в `chain`.

## 7. Остановка и перезапуск

```bash
npm run stop:all              # остановить веб-приложение и indexer
npm run stop:all -- --chain   # + локальная EVM-сеть
npm run stop:all -- --db      # + PostgreSQL
npm run stop:all -- --all     # всё
```

Если сервисы запущены через `npm run start:all`, достаточно нажать `Ctrl+C` в его терминале —
скрипт остановит дочерние процессы (PostgreSQL и сеть при этом останутся работать).

**Перезапуск**

```bash
npm run start:all      # снова поднимет всё, что не запущено
# или точечно:
npm run db:restart && npm run chain          # в отдельном терминале
npm run indexer                              # в отдельном терминале
npm run dev                                  # в отдельном терминале
```

Полный сброс (удалить БД и сеть, развернуть заново):

```bash
npm run stop:all -- --all
rm -rf data/pgdata                      # удалить базу
npm run start:all                       # initdb + deploy + indexer + web
```

Пере-деплой контракта без остановки сети:

```bash
npm run deploy:fresh    # новая сеть Hardhat + новый деплой + generate ABI
npm run indexer:resync  # перечитать историю с блока 0
```

## 8. Резервное копирование и восстановление БД

```bash
npm run db:backup                       # → data/backups/justtld-<YYYYMMDD-HHMMSS>.dump (+ .sql)
npm run db:restore                      # восстановить последнюю копию
bash scripts/restore-db.sh data/backups/justtld-20261120-193000.dump
bash scripts/restore-db.sh --sql data/backups/justtld-20261120-193000.sql
```

Что важно знать:

- Дамп делается `pg_dump --format=custom` (+ человекочитаемый `.sql`), восстановление —
  `pg_restore --clean --if-exists` в одну транзакцию.
- Перед восстановлением остановите indexer (`npm run stop:all`), после — запустите снова:
  он досинхронизирует состояние из блокчейна.
- Поскольку источник истины — блокчейн, потеря БД не критична: `npm run indexer:resync`
  полностью пересоберёт кэш и историю из событий контракта.
- Бэкап сети не нужен: локальная EVM-сеть эфемерна, но её состояние можно сохранить,
  скопировав `data/chain` (если используется persistent-режим) — по умолчанию сеть в памяти.

## 9. Администратор

Администратор — это **владелец контракта** (`owner()`), а не отдельная запись в БД.

### Как сделать владельцем контракта свой админ-аккаунт

Способ 1 — при деплое:

```bash
ADMIN_ADDRESS=0xВашАдрес npm run deploy:fresh
```

Скрипт деплоя передаёт `initialOwner` из `ADMIN_ADDRESS` (по умолчанию — деплоер).

Способ 2 — передать владение у существующего контракта:

```bash
npx hardhat console --network localhost
> const c = await ethers.getContractAt('JustTLDRegistry', '0x5FbDB2315678afecb367f032d93F642f64180aa3')
> await (await c.transferOwnership('0xВашАдрес')).wait()
> await c.owner()   // проверить
```

Затем пропишите тот же адрес в `.env`:

```bash
ADMIN_ADDRESS=0xВашАдрес
```

и перезапустите веб-приложение (`npm run stop:all && npm run start:all`).
API проверяет **и** сессию, **и** `owner()` контракта — подделка адреса в `.env` бесполезна.

### Вход в админ-панель

1. Откройте <http://localhost:3000/admin>.
2. Подключите кошелёк владельца (Dev Wallet #0 или MetaMask с адресом владельца).
3. Подпишите сообщение (EIP-191). Сервер выдаёт httpOnly-сессию `justtld_session` + CSRF-токен.
4. Все админ-действия подписываются кошельком: сервер лишь готовит неподписанную транзакцию.

Вкладки: **Зоны** (блокировка/разблокировка), **Чёрный список**, **Резерв**, **Система**
(pause/unpause, resync), **Аудит** (журнал действий администраторов).

### Заблокировать зону

- UI: `/admin` → вкладка «Зоны» → «Заблокировать» → указать причину → подтвердить транзакцию.
- API:

```bash
curl -s -X POST http://127.0.0.1:3000/api/admin/zones/scamzone/block \
  -H 'content-type: application/json' -H "cookie: $SESSION" -H "x-csrf-token: $CSRF" \
  -d '{"reason":"фишинг"}' | jq '.tx'
```

Блокировка записывается в контракт (`isBlocked = true`), в `zone_events`, `zones.status = 'blocked'`
и в `admin_audit_log`. Заблокированную зону нельзя передать и продлить (409 + revert `TLDBlocked`).
Разблокировка — `POST /api/admin/zones/:tld/unblock` или вкладка «Зоны».

## 10. Как добавить запрещённое слово

Чёрный список и резервные зоны хранятся **в контракте**, поэтому изменение требует
транзакции от владельца (`owner`). Панель лишь готовит её — подпись делает ваш кошелёк.

**UI:** `/admin` → вкладка «Чёрный список» → ввести слово (например `scam`) → «Добавить» →
подтвердить в кошельке. Слово нормализуется в нижний регистр и попадает в `blacklistedWords`.
Резервные зоны добавляются так же на вкладке «Резерв» (`addReservedTLD('.brand')`).

**Терминал:**

```bash
npx hardhat console --network localhost
> const c = await ethers.getContractAt('JustTLDRegistry', '0x5FbDB2315678afecb367f032d93F642f64180aa3')
> await (await c.addBlacklistedWord('scam')).wait()
> await (await c.addReservedTLD('.brand')).wait()
> [...(await c.blacklistedWords())]
> await (await c.removeBlacklistedWord('scam')).wait()   // убрать
```

Важно:

- Правило действует на **новые** регистрации. Уже существующие зоны блокируются отдельно
  (`blockTLD`), сам факт добавления слова их не трогает.
- Проверка выполняется и в контракте (истина), и в API (быстрый ответ 409
  `TLD_BLACKLISTED` / `TLD_RESERVED`) — списки читаются прямо из контракта.
- Встроенный резерв: `.eth .com .net .org .gov .edu .io .ai .sol` + `.localhost` (10 зон).

## 11. Архитектура

```
┌────────────┐   EIP-1193 / Dev Wallet (подпись в браузере)   ┌──────────────────┐
│  Браузер   │ ────────────────────────────────────────────▶ │  EVM (Hardhat)   │
│  Next.js   │ ◀──────────── чтение через /api/rpc ───────── │  :8545 chainId   │
└─────┬──────┘                                               │  JustTLDRegistry │
      │ REST /api/*                                          └────────┬─────────┘
      ▼                                                              │ события
┌────────────┐        SQL (кэш, поиск, история)              ┌────────▼─────────┐
│ Next API   │ ────────────────────────────────────────────▶ │  Indexer (tsx)   │
│ (route.ts) │                                               │  блоки → БД      │
└────────────┘                                               └────────┬─────────┘
                                                                      ▼
                                                             ┌──────────────────┐
                                                             │   PostgreSQL     │
                                                             └──────────────────┘
```

- **Источник истины** — контракт. Любая запись (регистрация, передача, продление, блокировка)
  идёт транзакцией и подписывается кошельком пользователя.
- **PostgreSQL** — кэш для быстрых списков/поиска, история событий, аналитика, аудит.
- **Indexer** — читает `TLDRegistered/TLDTransferred/TLDRenewed/TLDMetadataUpdated/TLDBlocked/TLDUnblocked`,
  пишет `zones`, `zone_events`, `transfer_requests`, ведёт чекпоинт в `indexer_checkpoints`.
- **API** никогда не хранит и не использует приватные ключи: он собирает `calldata`,
  симулирует вызов (`eth_call`) и отдаёт неподписанную транзакцию клиенту.

## 12. Контракт JustTLDRegistry

`contracts/contracts/JustTLDRegistry.sol` — Solidity 0.8.24, OpenZeppelin `Ownable`,
`ReentrancyGuard`, `Pausable`, custom errors, NatSpec на всех публичных функциях.

| Функция | Кто | Что делает |
| --- | --- | --- |
| `registerTLD(string tld, string metadata)` | любой | Регистрирует зону, отправитель становится владельцем, срок 365 дней |
| `transferTLD(string tld, address newOwner)` | владелец | Передаёт зону |
| `renewTLD(string tld)` | владелец | Продлевает на 365 дней (от `max(now, expiresAt)`) |
| `setTLDMetadata(string tld, string metadata)` | владелец | Обновляет метаданные |
| `getTLD(string tld) → TLDRecord` | все | Владелец, срок, статус, метаданные |
| `ownerOf(string tld) → address` | все | Владелец зоны |
| `exists(string tld) → bool` | все | Зарегистрирована ли зона |
| `totalZones() → uint256` | все | Всего зон |
| `isBlocked(string tld) → bool` | все | Заблокирована ли зона |
| `blockTLD(string tld, string reason)` | owner | Блокировка |
| `unblockTLD(string tld)` | owner | Разблокировка |
| `pause()` / `unpause()` | owner | Приостановка регистрации/продления |
| `addBlacklistedWord / removeBlacklistedWord` | owner | Чёрный список |
| `addReservedTLD / removeReservedTLD` | owner | Резерв зон |
| `setAllowReclaim(bool)` | owner | Разрешить перехват истёкших зон |
| `transferOwnership(address)` | owner | Передача владения контрактом (админ) |

События: `TLDRegistered`, `TLDTransferred`, `TLDRenewed`, `TLDMetadataUpdated`, `TLDBlocked`, `TLDUnblocked`.

Правила, зашитые в контракт:

- повторная регистрация существующей зоны запрещена (`TLDAlreadyExists`);
- передавать и продлевать может только владелец (`NotTLDOwner`);
- заблокированную зону нельзя передать и продлить (`TLDBlocked`);
- `REGISTRATION_PERIOD = 365 days`, продление всегда добавляет 365 дней;
- резерв, чёрный список и формат проверяются на стороне контракта (нельзя обойти через API);
- все изменяющие функции защищены `ReentrancyGuard`, owner-функции — `onlyOwner`,
  регистрация и продление — `whenNotPaused`.

ABI генерируется в `packages/shared/src/generated/registry.ts` командой
`node scripts/generate-abi.mjs` (запускается автоматически после деплоя).

## 13. Правила валидации TLD

| Правило | Значение |
| --- | --- |
| Ведущая точка | обязательна (`.myzone`), при вводе добавляется автоматически |
| Длина | 3–21 символ вместе с точкой (2–20 символов имени) |
| Символы | только `a-z`, `0-9`, `-` |
| Дефис | не первый и не последний, `--` запрещён |
| Регистр | приводится к нижнему |
| Резерв | `.eth .com .net .org .gov .edu .io .ai .sol .localhost` |
| Чёрный список | настраивается владельцем (по умолчанию `scam`, `phishing`, `malware`) |
| Дубликаты | запрещены |

Одна и та же проверка используется в UI (`packages/shared/src/tld.ts`), в API (Zod-схемы)
и в контракте — расхождение сообщений исключено. Коды ошибок: `TLD_EMPTY`, `TLD_LENGTH`,
`TLD_INVALID_CHARACTER`, `TLD_LEADING_HYPHEN`, `TLD_TRAILING_HYPHEN`, `TLD_DOUBLE_HYPHEN`,
`TLD_RESERVED`, `TLD_BLACKLISTED`, `TLD_ALREADY_EXISTS`.

## 14. База данных

Обязательные таблицы (полная схема — `packages/db/src/schema.sql`, 11 таблиц):

| Таблица | Назначение |
| --- | --- |
| `users(id, wallet_address, display_name, created_at)` | пользователи, вошедшие по подписи |
| `zones(id, tld, owner_address, status, registered_at, expires_at, metadata, transaction_hash, block_number, created_at, updated_at)` | кэш состояния зон |
| `zone_events(id, zone_id, event_type, actor_address, transaction_hash, block_number, details, created_at)` | история событий |
| `transfer_requests(id, zone_id, from_address, to_address, status, transaction_hash, created_at, completed_at)` | заявки на передачу (pending → completed) |
| `auth_nonces` | одноразовые nonce для входа (защита от replay) |
| `admin_audit_log` | журнал действий администраторов |
| `indexer_checkpoints` | курсор indexer (restart-safe) |
| `processed_logs` | дедупликация обработанных логов |
| `tx_intents` | подготовленные неподписанные транзакции |
| `indexer_commands` | команды indexer (resync) |
| `schema_migrations` | применённые миграции |

`status` зоны: `active` | `grace` | `expired` | `blocked` (вычисляется из контракта и времени).
Истина всегда проверяема: `GET /api/zones/:tld` отдаёт `chain.owner`, `chain.expiresAt` рядом с кэшем.

## 15. Indexer

`packages/indexer/src/` — `main.ts` (цикл), `processor.ts` (разбор логов), `chain.ts`, `config.ts`.

- стартует с `deployBlock` из `deployments/localhost.json` (или `INDEXER_CHECKPOINT`), чекпоинт в БД;
- пишет блок только после обработки всех логов блока → **события не теряются**;
- таблица `processed_logs` + `ON CONFLICT` делают обработку **идемпотентной** (рестарт безопасен);
- обновляет `zones`, `zone_events`, `transfer_requests`, `users`;
- `npm run indexer:resync` очищает кэш и перечитывает цепочку с нуля;
- состояние видно в `GET /api/health` (`indexer.lag`, `indexer.lastBlock`).

Проверено тестом: повторная обработка того же блока не создаёт дублей, а `purge + resync`
восстанавливает историю из 5 событий без потерь.

## 16. API

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/health` | статус БД, RPC, контракта, лаг indexer |
| GET | `/api/stats` | агрегаты: всего зон, активных, событий |
| GET | `/api/zones?page&limit&status&owner&sort` | список зон с пагинацией |
| GET | `/api/zones/:tld` | зона из кэша + из контракта (`consistent`) |
| GET | `/api/zones/:tld/history?page&limit` | история событий зоны |
| GET | `/api/search?q=` | поиск + доступность зоны |
| POST | `/api/zones/prepare-registration` | неподписанная tx регистрации (201) |
| POST | `/api/zones/prepare-transfer` | tx передачи, проверяет владельца (403 чужому) |
| POST | `/api/zones/prepare-renewal` | tx продления |
| POST | `/api/zones/prepare-metadata` | tx обновления метаданных |
| POST | `/api/zones/confirm` | подтверждение hash для истории |
| POST | `/api/admin/zones/:tld/block` | блокировка (admin + CSRF) |
| POST | `/api/admin/zones/:tld/unblock` | разблокировка (admin + CSRF) |
| POST | `/api/admin/pause`, `/unpause`, `/resync` | системные операции (admin) |
| POST | `/api/admin/blacklist`, `/reserved` | списки в контракте (admin) |
| GET | `/api/admin/audit`, `/lists` | журнал и текущие списки (admin) |
| POST | `/api/auth/nonce`, `/api/auth/verify`, `/logout`, GET `/session` | вход по подписи EIP-191 |
| GET | `/api/contracts` | адрес, chainId, ABI, ссылки |
| POST | `/api/rpc` | JSON-RPC прокси к локальному узлу (whitelisted-методы) |
| GET | `/api/dev/wallets` | тестовые аккаунты (только dev) |

Пример:

```bash
curl -s 'http://127.0.0.1:3000/api/zones?limit=3&status=active' | jq '.items[] | {tld, ownerAddress, status}'
curl -s 'http://127.0.0.1:3000/api/search?q=myzone' | jq '.availability'
```

Все ответы: `{ ...data }` или `{ "error": { "code": "...", "message": "...", "details": {...} } }`.
Ошибки контракта маппятся в HTTP: `TLDAlreadyExists` → 409, `NotTLDOwner` → 403,
`TLDBlocked` → 409, некорректный ввод → 400.

## 17. Веб-интерфейс

| Страница | Что показывает |
| --- | --- |
| `/` | лендинг: слоган, поиск доступности, статистика, последние зоны |
| `/zones` | список зон: поиск, фильтры по статусу, сортировка, пагинация |
| `/zone/[tld]` | карточка зоны: владелец, срок, метаданные, история, действия |
| `/register` | регистрация: валидация на лету, проверка доступности, подпись tx |
| `/dashboard` | мои зоны: передать, продлить, изменить метаданные |
| `/admin` | админ-панель (вход по подписи): зоны, списки, система, аудит |
| `/docs` | документация в приложении: адреса, правила, API, функции контракта |
| `/explorer`, `/tx/[hash]`, `/block/[n]`, `/address/[addr]` | встроенный обозреватель сети |
| `/resolve?zone=<имя>` | резолвер имён: карточка зоны или редирект на сайт из метаданных |
| `/<имя>` | то же самое без своего домена: `justtld.onrender.com/myzone` открывает зону `.myzone` |

Темы: тёмная/светлая (переключатель в шапке), языки: RU/EN, вёрстка адаптивная.

Каждая операция показывает полный жизненный цикл: `idle → подготовка tx → ожидание подписи →
pending (hash) → confirmed (номер блока, gas) | failed (причина revert или отказ кошелька)`.

## 17.5. Резолвер имён: `myzone.вашдомен`

Реестр полезен, когда имя открывается в браузере. Резолвер делает это без правок DNS на каждую
зону: запрос на любой поддомен домена из `RESOLVER_DOMAIN` попадает в то же приложение, а
`middleware.ts` смотрит заголовок `Host` и переписывает путь на `/resolve?zone=<имя>`.

Что видит посетитель:

| Адрес | Что происходит |
| --- | --- |
| `myzone.домен` (зона активна, метаданных о сайте нет) | карточка зоны: владелец, срок, транзакция, блок, ссылка в обозреватель |
| `justtld-demo.домен` (в метаданных `{"url": "https://…"}`) | `307` на этот адрес |
| `свободное-имя.домен` | «Зона свободна» + кнопка регистрации на основном домене |
| истёкшая зона | «Срок этой зоны истёк» + регистрация (контракт разрешает занять имя любому) |
| `www`, `api`, `admin`, `app`, голый домен, `a.b.домен` | обычные страницы сайта — резолвер не вмешивается |
| `/myzone`, `/freename` (без своего домена) | то же самое по пути: имя зоны = последний сегмент адреса |
| `/zones`, `/register`, `/docs`, `/api/*` и т.п. | реальные разделы сайта — зарезервированы, резолвер их не трогает |

```bash
# локальная проверка без DNS: скрипт подставляет заголовок Host
PORT=3300 RESOLVER_DOMAIN=localtest.test DATABASE_URL=… npm start
npm run test:resolver -- http://127.0.0.1:3300 localtest.test
```

Без своего домена резолвер всё равно работает — имя открывается по пути, и это тот же
код, что и поддомены: `justtld.onrender.com/myzone` → зона `.myzone`.

![Резолвер: имя по пути](docs/resolver-path.png)

![Резолвер: карточка зоны на поддомене](docs/resolver-zone.png)

В продакшене нужен wildcard-DNS `*.justtld.вашдомен → justtld.onrender.com` и переменная
`RESOLVER_DOMAIN` — пошагово в [docs/DEPLOY-PAAS.md §3](docs/DEPLOY-PAAS.md).

## 18. Безопасность

| Риск | Мера |
| --- | --- |
| Приватные ключи | Не хранятся и не передаются на сервер. Подпись — только в кошельке пользователя |
| Подмена владельца | Сервер проверяет, что `sender` совпадает с `ownerOf(tld)` (403 иначе), и контракт проверяет то же самое |
| Ввод | Zod-схемы на всех эндпоинтах + та же валидация в контракте |
| Rate limiting | Скользящее окно по IP: `RATE_LIMIT_READ/WRITE/AUTH/ADMIN` (429) |
| Админка | httpOnly-сессия (jose JWT), вход по подписи EIP-191, роль = владелец контракта |
| CSRF | Double-submit cookie (`justtld_csrf` + `x-csrf-token`) + проверка `Origin` для небезопасных методов |
| Replay | Одноразовые nonce в `auth_nonces` с TTL, сессия с ограниченным сроком |
| XSS | React-экранирование, `dangerouslySetInnerHTML` не используется, CSP в `middleware.ts` |
| SQL-инъекции | Только параметризованные запросы (`pg` pool), нет конкатенации SQL |
| SSRF | `/api/rpc` — белый список методов и единственный upstream (локальный узел) |
| Кэширование | `Cache-Control: no-store` на `/api/*`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |
| Аудит | `admin_audit_log`: кто, что, когда, IP, user-agent, результат |
| Ошибки кошелька | Отказ пользователя (`REJECTED`) и revert контракта разбираются и показываются человекочитаемо |
| Dev Wallet | Только при `NEXT_PUBLIC_ENABLE_DEV_WALLET=true` и `NODE_ENV !== production`; ключи Hardhat публичны по определению |

## 19. Тесты

```bash
npm test               # всё: контракт + shared + indexer + API/UI (нужны сеть и БД)
npm run test:contracts # 49 тестов Hardhat: регистрация, дубликаты, transfer, renew, block, события
npm run test:shared    # 12 тестов: нормализация, формат, резерв, Zod-схемы
npm run test:integration # 8 тестов indexer на реальных событиях (нужны сеть + PostgreSQL)
npm run test:ui        # 28 тестов: API (19) + интерфейс (9) через jsdom
npm run test:resolver  # резолвер: поддомены зон, редирект из метаданных, служебные имена
npm run test:walletconnect # WalletConnect в мобильном браузере (нужен запущенный сервер)
npm run setup:domain    # домен резолвера: 4 записи в Cloudflare + домены/env/деплой в Render
npm run await:domain    # ждёт переключения NS, затем доводит деплой и проверяет резолвер
npm run verify:e2e     # сквозной сценарий из 19 шагов против живой системы
npm run lint           # ESLint (0 warnings)
npm run typecheck      # TS strict: корень + контракты + web
npm run format:check   # Prettier
```

Покрытые требования: успешная регистрация, невалидное имя отклонено, дубликат отклонён,
передача владельцем, передача не-владельцем отклонена, продление владельцем, продление чужой
зоны отклонено, блокировка/разблокировка, события контракта, indexer, API, ключевые сценарии UI.

`verify:e2e` проверяет на живой системе: health → вход по подписи → prepare-registration →
транзакцию в сети → событие `TLDRegistered` → строки в `zones`/`zone_events` → страницу зоны →
сверку кэша с цепочкой → transfer (`ownerOf`) → `transfer_requests.completed` → renew (+365 дней) →
дубликат (409 `TLDAlreadyExists`) → вход админа → блокировку (`isBlocked`) → отказ в продлении →
разблокировку → `admin_audit_log` → статистику.

## 20. CI

- `.github/workflows/ci.yml` — Prettier, ESLint, `tsc --noEmit` (3 проекта), тесты контракта,
  тесты shared, `next build`.
- `.github/workflows/integration.yml` — PostgreSQL как service, Hardhat node, деплой, миграции,
  тесты indexer, запуск indexer, тесты API/UI и `verify:e2e` против реальной сети.

## 21. Переменные окружения

Все значения — в `.env` (создаётся из `.env.example`). Приватных ключей там нет.

| Переменная | По умолчанию | Смысл |
| --- | --- | --- |
| `RPC_URL` | `http://127.0.0.1:8545` | локальный узел |
| `CHAIN_ID` | `31337` | chainId сети |
| `DATABASE_URL` | `postgresql://justtld:justtld@127.0.0.1:5432/justtld` | подключение к БД |
| `ADMIN_ADDRESS` | адрес #0 Hardhat | владелец контракта |
| `SESSION_SECRET` | генерируется | подпись сессионных JWT (≥32 символа) |
| `INDEXER_CONFIRMATIONS` | `1` | глубина подтверждений |
| `INDEXER_POLL_INTERVAL_MS` | `1000` | период опроса |
| `RATE_LIMIT_*` | 240/30/10/20 | лимиты запросов в минуту |
| `NEXT_PUBLIC_ENABLE_DEV_WALLET` | `true` | доступен ли Dev Wallet |
| `EXPLORER_TX_URL_TEMPLATE` | пусто | внешний обозреватель (иначе встроенный) |
| `SEED_EXTRA_BLACKLIST` | `scam,phishing,malware` | слова для первичного заполнения |
| `RESOLVER_DOMAIN` | пусто | домен резолвера: `myzone.<домен>` открывает зону `.myzone` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | адрес сайта в ссылках резолвера (нужна пересборка) |

## 22. Срок жизни зоны

- Регистрация — 365 дней. Продление добавляет 365 дней к `max(now, expiresAt)` — то есть
  продлевать можно заранее, срок не «сгорает».
- После истечения зона попадает в `grace` (30 дней) — всё ещё принадлежит владельцу,
  но помечена как истёкшая.
- После `expiry + GRACE_PERIOD` зона может быть перехвачена любым адресом, если владелец
  контракта включил `allowReclaim` (по умолчанию **включено** — так локальная сеть не
  заполняется «мёртвыми» именами).

Как это сочетается с правилом «повторная регистрация запрещена»:

| Состояние зоны | Можно зарегистрировать заново? |
| --- | --- |
| `active` | нет — `TLDAlreadyExists` |
| `grace` (истекла, но ≤ 30 дней) | нет — `TLDAlreadyExists` |
| `expired` (> 30 дней после истечения) | да, если `allowReclaim = true`, иначе нет |
| `blocked` | нет — только владелец контракта снимает блокировку |

Выключить перехват: `await c.setAllowReclaim(false)` (owner) или `/admin` → «Система».
Флаг виден в `deployments/localhost.json` (`allowReclaim`) и в `getTLD().status`.

## 23. Диагностика

| Симптом | Что делать |
| --- | --- |
| `EADDRINUSE :3000` | `pkill -f next-server` или `npm run stop:all`, затем запустить снова |
| `EADDRINUSE :8545` | уже работает сеть: `lsof -i :8545`, либо `npm run stop:all -- --chain` |
| `/api/health` показывает `indexer.lag > 0` | подождать пару секунд; если растёт — `tail -f logs/indexer.log` |
| `500` при регистрации, код `TLD_ALREADY_EXISTS` | зона уже есть — проверьте `/zone/<tld>` |
| Кэш расходится с контрактом (`consistent: false`) | `npm run indexer:resync` |
| PostgreSQL не стартует | `tail -50 logs/postgres.log`; пересоздать: `rm -rf data/pgdata && npm run db:setup` |
| Админка отдаёт 401/403 | кошелёк должен быть владельцем контракта; проверьте `await c.owner()` и `ADMIN_ADDRESS` |
| После рестарта веб-приложения сессия слетела | это нормально: сессия живёт до истечения JWT (или перезапуска с новым `SESSION_SECRET`) |
| Транзакция «зависла» в pending | локальная сеть майнит по одной транзакции; проверьте `logs/chain.log` |

Полезное:

```bash
curl -s http://127.0.0.1:3000/api/health | jq
curl -s http://127.0.0.1:3000/api/stats | jq
curl -s http://127.0.0.1:3000/api/contracts | jq '{address, chainId}'
bash scripts/db.sh psql          # интерактивный psql
```

## 24. Структура репозитория

```
justtld/
├── apps/web/                 Next.js 15 (App Router, TS, Tailwind, shadcn/ui)
│   ├── app/                  страницы и API-роуты
│   ├── components/           UI: зоны, кошелёк, транзакции
│   ├── lib/                  клиент: api, wallet, hooks, i18n
│   ├── lib/server/           сервер: auth, chain, tx, rate-limit, http
│   ├── middleware.ts         CSP и security-заголовки
│   └── test/                 api.test.ts, ui.test.tsx
├── contracts/                JustTLDRegistry.sol, hardhat.config.ts, deploy, 49 тестов
├── packages/
│   ├── shared/               TLD-валидация, Zod-схемы, типы, ABI, форматирование
│   ├── db/                   schema.sql, пул, миграции, репозитории
│   └── indexer/              процессор событий + тесты
├── scripts/                  start-all, stop-all, db.sh, setup-db.sh, backup/restore, verify-e2e
├── deployments/              localhost.json (адрес, owner, блок деплоя)
├── data/                     pgdata, backups, pids
├── docs/                     ARCHITECTURE.md, отчёт приёмки
└── logs/                     chain.log, indexer.log, web.log, postgres.log
```

---

**Лицензия:** MIT (код контракта и приложения). Локальная сеть и тестовые ключи —
исключительно для разработки.
