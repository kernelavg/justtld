# JustTLD — отчёт о приёмке

Дата: 2026-11-20 · Локальная EVM-сеть + PostgreSQL, всё проверено на живой системе.

**Слоган:** «Создай свою зону. Владей своим пространством.»

---

## 1. Команда запуска

```bash
cd justtld
npm install          # один раз
npm run start:all    # вся система: PostgreSQL → EVM-сеть → деплой → миграции → indexer → web
```

Вывод в терминале (реальный запуск):

```
[justtld] PostgreSQL уже слушает порт 5432
[justtld] EVM-сеть уже слушает порт 8545
[justtld] деплой контракта JustTLDRegistry…
✔ Контракт уже развёрнут по адресу 0x5FbDB2315678afecb367f032d93F642f64180aa3 — переиспользую.
[justtld] миграции базы данных…
[justtld] запуск indexer…
[justtld] запуск Next.js (production build)…
══════════════════════════════════════════════════════════════════════════
Система запущена
```

Отдельные команды для пошагового запуска: `npm run chain`, `npm run db:setup`, `npm run deploy`,
`npm run indexer`, `npm run dev` (или `npm run build && npm start`).

## 2. Адрес контракта

```
JustTLDRegistry: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Блок деплоя:     1
owner:           0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

Источник — `deployments/localhost.json`, отдаётся также через `GET /api/contracts`.
Проверено: `eth_getCode` возвращает 14 719 байт.

## 3. RPC URL

```
http://127.0.0.1:8545      chainId 31337 (JustTLD Local Devnet)
```

## 4. Адрес веб-приложения

```
http://localhost:3000
```

(сервер слушает `0.0.0.0:3000`). Страницы: `/`, `/zones`, `/zone/[tld]`, `/register`, `/dashboard`,
`/admin`, `/docs`, плюс встроенный обозреватель `/explorer`, `/tx/[hash]`, `/block/[n]`, `/address/[addr]`.

## 5. Как зарегистрировать зону

1. Открыть <http://localhost:3000/register>, подключить кошелёк (MetaMask через `window.ethereum`
   или «Dev Wallet» — реальный подписант на тестовом ключе Hardhat #1).
2. Ввести имя (`myzone`), дождаться «Зона свободна».
3. «Зарегистрировать за gas» → подписать в кошельке → статус `pending` → `confirmed`
   с номером блока и ссылкой `/tx/<hash>`.

Через API (сервер только готовит неподписанную транзакцию):

```bash
curl -s -X POST http://127.0.0.1:3000/api/zones/prepare-registration \
  -H 'content-type: application/json' \
  -d '{"tld":"myzone","metadata":"{\"site\":\"https://my.zone\"}","sender":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8"}'
```

…затем подпись/отправка кошельком и `POST /api/zones/confirm`.

## 6. Как проверить владельца зоны

```bash
curl -s http://127.0.0.1:3000/api/zones/myzone | jq '{cache: .zone.ownerAddress, chain: .chain.owner, consistent}'
```

- страница `/zone/myzone` — владелец, статус, срок, метаданные, история событий;
- контракт (истина): `await c.ownerOf('myzone')` в `npx hardhat console --network localhost`;
- история: `GET /api/zones/myzone/history`;
- обозреватель: `/address/0x…`, `/tx/0x…`.

## 7. Как остановить

```bash
npm run stop:all            # web + indexer
npm run stop:all -- --chain # + локальная EVM-сеть
npm run stop:all -- --db    # + PostgreSQL
npm run stop:all -- --all   # всё
```

Либо `Ctrl+C` в терминале `npm run start:all`. Проверено: после `npm run stop:all` не остаётся
ни одного процесса `next-server` / `tsx src/main.ts`, супервизор выходит сам.

## 8. Как перезапустить

```bash
npm run start:all           # идемпотентно: поднимет только отсутствующие сервисы
```

Точечно: `npm run db:restart`, `npm run chain`, `npm run indexer`, `npm run dev`.
Полный сброс: `npm run stop:all -- --all && rm -rf data/pgdata && npm run start:all`.
Пере-деплой контракта: `npm run deploy:fresh && npm run indexer:resync`.

## 9. Как сделать бэкап БД

```bash
npm run db:backup
```

Создаёт `data/backups/justtld-<YYYYMMDD-HHMMSS>.dump` (pg_dump custom) и `.sql` (plain).
Реальный результат:

```
[backup] pg_dump → data/backups/justtld-20261120-201006.dump
  data/backups/justtld-20261120-201006.dump (41K)
  data/backups/justtld-20261120-201006.sql  (71K)
```

## 10. Как восстановить БД

```bash
npm run db:restore                                         # последняя копия
bash scripts/restore-db.sh data/backups/<файл>.dump        # конкретная копия
bash scripts/restore-db.sh --sql data/backups/<файл>.sql   # из plain SQL
```

Проверено на живой системе: после остановки indexer восстановление вернуло `зоны: 36, события: 47`,
indexer при следующем старте досинхронизировал чекпоинт (`лаг 0`).
Поскольку блокчейн — источник истины, потеря БД не критична: `npm run indexer:resync`
полностью пересобирает кэш и историю из событий контракта.

## 11. Как добавить запрещённую зону

Два разных действия, оба требуют транзакции и подписи владельца контракта:

**а) Запрещённое слово (чёрный список)** — `/admin` → вкладка «Чёрный список» → слово → «Добавить»
→ подписать в кошельке. Или в терминале:

```bash
npx hardhat console --network localhost
> const c = await ethers.getContractAt('JustTLDRegistry','0x5FbDB2315678afecb367f032d93F642f64180aa3')
> await (await c.addBlacklistedWord('scam')).wait()
> [...(await c.blacklistedWords())]     // ['scam','phishing','malware']
```

**б) Заблокировать уже существующую зону** — `/admin` → вкладка «Зоны» → «Заблокировать» (с причиной),
или `POST /api/admin/zones/:tld/block` с сессией админа и CSRF-токеном. Ставит on-chain
`isBlocked = true`, пишет `zone_events`, `zones.status = 'blocked'`, `admin_audit_log`.
Заблокированную зону нельзя передать и продлить (409 + revert `TLDBlocked`).
Снять блокировку: `/admin` → «Разблокировать» или `POST /api/admin/zones/:tld/unblock`.

Резерв зон — так же: `/admin` → «Резерв» или `c.addReservedTLD('.brand')`.

## 12. Как сделать владельцем контракта свой админ-аккаунт

```bash
# вариант 1: сразу при деплое
ADMIN_ADDRESS=0xВашАдрес npm run deploy:fresh

# вариант 2: передать владение у существующего контракта
npx hardhat console --network localhost
> const c = await ethers.getContractAt('JustTLDRegistry','0x5FbDB2315678afecb367f032d93F642f64180aa3')
> await (await c.transferOwnership('0xВашАдрес')).wait()
```

Затем `ADMIN_ADDRESS=0xВашАдрес` в `.env` и перезапуск веб-приложения.
Админ-доступ проверяется дважды: сессия (EIP-191) **и** `owner()` контракта — правка `.env`
без реального владения ничего не даёт.

---

## Доказательства работы

### Сквозной сценарий `npm run verify:e2e` — 19/19 OK

```
 1. OK   Контракт задеплоен
 2. OK   Health-check приложения, БД, узла и индексатора
 3. OK   Кошелёк подключается и подписывает сообщение (EIP-191)
 4. OK   POST /api/zones/prepare-registration возвращает неподписанную транзакцию
 5. OK   Пользователь регистрирует зону: tx подписана кошельком и попала в блок
 6. OK   Событие TLDRegistered присутствует в блоке
 7. OK   Indexer записал зону и событие в PostgreSQL
 8. OK   Страница зоны отдаётся и содержит адрес владельца
 9. OK   API зоны сверяет кэш с блокчейном и показывает владельца
10. OK   Передача зоны владельцем: ownerOf изменился на новый адрес
11. OK   Indexer обновил владельца и закрыл transfer_request
12. OK   Продление зоны владельцем добавляет 365 дней
13. OK   Повторная регистрация отклоняется (API 409 + revert контракта)
14. OK   Админ входит по подписи и получает роль admin (owner контракта)
15. OK   Админ блокирует зону: on-chain флаг + запись в аудит-логе
16. OK   Заблокированную зону нельзя продлить
17. OK   Админ разблокирует зону
18. OK   Аудит-лог администратора содержит выполненные действия
19. OK   Итоговое состояние: зона, владелец, статус и статистика
```

### Тесты: 97, все зелёные

| Набор | Команда | Тестов |
| --- | --- | --- |
| Контракт (Hardhat) | `npm run test:contracts` | 49 |
| Валидация/схемы | `npm run test:shared` | 12 |
| Indexer на реальных событиях | `npm run test:integration` | 8 |
| API + UI | `npm run test:ui` | 28 |

Требуемые сценарии покрыты: успешная регистрация, невалидное имя, дубликат, передача владельцем,
передача не-владельцем (revert + 403), продление владельцем, продление чужой зоны, блокировка/разблокировка,
все 6 событий, restart-safe indexer и полный resync, API (включая 401/403/409/429 и CSRF), ключевые UI-сценарии.

### Качество кода

```
npx prettier --check .   → All matched files use Prettier code style!
npx eslint . --max-warnings=0 → без замечаний
tsc --noEmit (корень, contracts, apps/web) → 0 ошибок
npm run build → 18 маршрутов + middleware 34.4 kB
```

CI: `.github/workflows/ci.yml` (формат, линт, типы, тесты контракта и shared, сборка) и
`.github/workflows/integration.yml` (PostgreSQL service + Hardhat node + деплой + indexer +
тесты API/UI + `verify:e2e`).

### Текущее состояние живой системы

```
GET /api/health → status: ok
  database ok (13 ms) · rpc ok (43 ms, block 74) · contract ok (14 719 байт) · indexer ok (lag 0)
GET /api/zones   → total 36 зон в кэше, 47 событий
```

---

## Соответствие требованиям

| Требование | Статус |
| --- | --- |
| Solidity-контракт с OZ Ownable/ReentrancyGuard/Pausable, NatSpec, custom errors | ✅ `contracts/JustTLDRegistry.sol` |
| 6 событий, все функции (register/transfer/renew/metadata/get/ownerOf/exists/totalZones/block/unblock/pause/unpause) | ✅ 49 тестов |
| Срок 365 дней, продление +365 | ✅ проверено на живых транзакциях |
| Валидация TLD (точка, 3–21, a-z0-9-, дефисы, нижний регистр, резерв, чёрный список, дубликаты) | ✅ в UI, API и контракте |
| Локальная EVM-сеть вместо мока | ✅ Hardhat node, реальные подписи и блоки |
| Next.js + TS + Tailwind + shadcn/ui, 7 обязательных страниц | ✅ + обозреватель |
| Кошелёк: подключение, адрес, регистрация, проверка доступности, подтверждение, pending/confirmed/failed, ссылка на tx | ✅ MetaMask (EIP-1193) + Dev Wallet |
| Transfer, renew, metadata update, поиск, фильтры, темы, мобильная вёрстка, RU/EN | ✅ |
| PostgreSQL: 4 обязательные таблицы (+7 служебных) | ✅ `packages/db/src/schema.sql` |
| Indexer: события, restart-safe, без потерь, кэш, история, полный resync | ✅ 8 тестов |
| API: все обязательные эндпоинты + prepare-* | ✅ 26 маршрутов |
| Безопасность: без приватных ключей, проверка владельца, Zod, rate limit, защищённый админ, XSS/CSRF/SSRF/SQLi/replay, аудит, обработка ошибок кошелька | ✅ см. README §18 |
| Тесты + ESLint + Prettier + TS strict + GitHub Actions | ✅ 97 тестов, 2 workflow |
| README с запуском/остановкой/restore | ✅ `README.md` |
| Отчёт приёмки с 12 пунктами | ✅ этот файл |

---

## Известные ограничения

1. **Dev Wallet** — только для локальной разработки (`NEXT_PUBLIC_ENABLE_DEV_WALLET=true`,
   ключи Hardhat публичны). Для настоящего кошелька используется MetaMask; в sandbox-превью
   расширение недоступно, поэтому демонстрация идёт через Dev Wallet, а подпись и транзакция
   при этом реальные.
2. **Локальная сеть эфемерна**: остановка `npm run chain` обнуляет состояние цепочки.
   Кэш в PostgreSQL остаётся, поэтому после перезапуска сети нужен `npm run deploy:fresh`
   и `npm run indexer:resync`.
3. **Перехват истёкших зон** (`allowReclaim`, по умолчанию включён) разрешает регистрацию имени
   после `expiry + 30 дней` — это осознанное дополнение к правилу «повторная регистрация запрещена»,
   которое действует для `active` и `grace`. Описано в README §22; выключается
   `setAllowReclaim(false)` из `/admin`.
4. **Уведомлений по e-mail нет** — вне области задачи (всё взаимодействие on-chain и в UI).
