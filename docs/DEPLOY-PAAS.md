# Публичный хостинг JustTLD: Neon (PostgreSQL) + Render (сайт и indexer)

Вариант выбран: **бесплатный PaaS**. Инструкция рассчитана на человека без опыта DevOps:
всё делается в браузере, кода писать не нужно. Всё, что нужно от репозитория, уже добавлено:
`Dockerfile`, `render.yaml`, SSL для управляемого Postgres, поддержка `PORT`, автозапуск миграций.

Итоговая схема:

```
Браузер ──HTTPS──▶ Render (наш Next.js + API + indexer в одном контейнере)
                        │
                        ├──▶ Neon PostgreSQL (кэш, история, аудит)
                        └──▶ публичный RPC сети (Sepolia / Mainnet) ──▶ контракт JustTLDRegistry
```

---

## 0. Важно про InfinityFree (и любой shared-хостинг)

InfinityFree — это PHP/MySQL-хостинг **без Node.js и без PostgreSQL**. Наше приложение — Next.js
(нужен Node 20) с базой PostgreSQL, поэтому запустить его там нельзя. Что можно сделать:

- держать на InfinityFree **статическую визитку/редирект** на ваш домен → `https://justtld.onrender.com`;
- сам реестр и сайт разместить на Render (бесплатно).

Ещё нюанс для будущего резолвера имён (`myzone.вашдомен`): нужен **wildcard-DNS** (`*.вашдомен`)
и сертификат на wildcard. InfinityFree такое не даёт — для этого используют Cloudflare (бесплатный
тариф, Universal SSL покрывает `*.домен`). Это шаг 4, не блокирует запуск реестра.

---

## 0. Быстрый путь: статическая страница на InfinityFree (работает уже сейчас)

В репозитории есть `public/static-dapp.html` — самодостаточная страница без сервера и без Node.js:
она читает зоны напрямую из публичного RPC Sepolia и подписывает транзакции через кошелёк.
Проверена автотестом (`npm run test:static-dapp`) против реальной сети: подключение, валидация,
регистрация, список зон, отклонение занятого имени.

Как опубликовать за 5 минут:

1. Панель InfinityFree → **File Manager** (или FTP) → папка `htdocs`.
2. Загрузить один файл: `static-dapp.html` (можно переименовать в `index.html`).
3. Открыть адрес в браузере **внутри MetaMask**: приложение → вкладка **Browser** (браузер) →
   вставить `https://ваш-сайт.infinityfreeapp.com` → Connect → зарегистрировать зону.
   Именно внутри MetaMask, потому что только так страница получает доступ к `window.ethereum`;
   в обычном мобильном браузере подключение к кошельку недоступно.
4. Параметры можно переопределить в URL: `?contract=0x…&rpc=https://…`.

Страница поддерживает два режима подключения:

| Режим | Когда | Как |
| --- | --- | --- |
| Кошелёк в браузере (`window.ethereum`) | Сайт открыт внутри MetaMask (вкладка Explore → адресная строка) или в браузере с кошельком (Brave, расширение MetaMask) | Кнопка **Подключить** → выбор аккаунта → подпись каждой транзакции в кошельке |
| Локальная подпись по ключу | Обычный Chrome/Safari на телефоне, встроенного браузера нет | Кнопка **«Нет кошелька в браузере? Войти по ключу»** → вставить приватный ключ testnet-аккаунта → подпись происходит в самой странице (viem `privateKeyToAccount`), ключ никуда не уходит и очищается из поля сразу после входа |

Второй режим — только для тестовой сети и только для аккаунта без реальных денег: ключ живёт в памяти
страницы, пока она открыта. Оба режима проверены автотестами против живой Sepolia:
`npm run test:static-dapp` (кошелёк) и `node scripts/test-static-dapp-local.mjs` (локальная подпись).

Это полностью рабочий публичный доступ к реестру (слой 1). Полноценный сайт с базой, поиском
и админкой — по шагам ниже.

## 0.5. Исходники контракта опубликованы

```bash
npm run verify:sepolia     # Etherscan (API-ключ из .env.secrets) + Sourcify exact_match
```

Адрес, владелец и аргументы конструктора берутся из `deployments/sepolia.json`, поэтому повторная
проверка безопасна: «уже проверен» не считается ошибкой.

## 0.9. Деплой в один клик (Render Blueprint)

Репозиторий публичный: https://github.com/kernelavg/justtld — `render.yaml` уже описывает сервис.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/kernelavg/justtld)

Кнопка ведёт на `https://render.com/deploy?repo=https://github.com/kernelavg/justtld`: вход через GitHub →
Blueprint подставит все переменные, кроме одной — **`DATABASE_URL`** (строка из Neon, шаг 1). Всё остальное
уже прописано: сеть Sepolia, RPC, `INDEXER_START_BLOCK=12177490` (блок деплоя контракта),
`ADMIN_ADDRESS=0x2ba5…d886`, `RUN_INDEXER_IN_WEB=true`, `PGSSLMODE=require`, `SESSION_SECRET`
генерируется Render'ом.

После первого деплоя: `https://justtld.onrender.com/api/health` должен вернуть `status: ok`,
`chainId: 11155111`. Если Render выдал другое имя сервиса — поправьте `NEXT_PUBLIC_APP_URL`
в панели и пересоберите (эта переменная вшивается в бандл при сборке).

## 0.95. Render: сервис запущен (2026-11-20)

| | |
| --- | --- |
| Адрес | **https://justtld.onrender.com** |
| Тип | Web Service, Docker, Free, Frankfurt |
| Деплой | Blueprint из `kernelavg/justtld`, ветка `main`, `autoDeploy: true` (каждый push пересобирает образ) |
| Первый деплой | 3 мин 12 с |
| `/api/health` | `status: ok` · БД 2 мс · RPC chainId 11155111 · код контракта 14 719 байт · лаг индексера 2 |
| Страницы | `/`, `/zones`, `/explorer`, `/register`, `/docs`, `/admin`, `/zone/.myzone` — все 200 |
| API | `/api/stats` 9 зон / 9 событий, `/api/zones`, `/api/zones/.myzone`, `/api/search?q=myzone` — данные сходятся с цепью |

Особенность бесплатного тарифа: инстанс засыпает после ~15 минут без запросов, первый запрос после сна
занимает до 50 секунд. Индексер при пробуждении продолжает с чекпоинта в Neon, поэтому данные не теряются
и догоняют цепь за один проход.

## 1. База данных: Neon (сделано 2026-11-20)

База создана и наполнена:

| | |
| --- | --- |
| Хост | `ep-orange-base-basu9t3a-pooler.c-8.eu-central-1.aws.neon.tech` (Франкфурт, pooled) |
| СУБД | PostgreSQL 18.7 |
| Схема | применена (`npm run db:migrate`): 11 таблиц |
| Данные | индексер прошёл блоки 12177490…12178027, в базе 9 зон и 9 событий — совпадает с `totalZones()` контракта |
| Строка подключения | в локальном `.env.secrets` как `NEON_DATABASE_URL` (в git не попадает) |

Осталось только вставить эту строку в Render как `DATABASE_URL`.

### Если база ещё не создана



1. https://neon.com → **Sign up** (можно через GitHub/Google).
2. **Create project** → имя `justtld`, регион **AWS eu-central-1 (Frankfurt)** — ближе к Render Frankfurt.
3. В панели проекта: **Connection string** → выберите «Pooled connection» → скопируйте строку вида

   ```
   postgresql://neondb_owner:AbCd1234@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

4. Это и есть `DATABASE_URL`. Строка уже содержит `sslmode=require` — наш драйвер это понимает
   (добавлена поддержка TLS для управляемых баз).

Таблицы создавать не нужно: контейнер при старте выполнит миграции
(`RUN_MIGRATIONS=true` → `packages/db/src/migrate.ts`), они идемпотентны.

## 2. Сайт и indexer: Render (10 минут, бесплатно)

1. https://render.com → **Sign up**, привяжите GitHub.
2. Загрузите код в свой репозиторий (можно приватный):

   ```bash
   cd justtld
   git init && git add -A && git commit -m "JustTLD"
   git branch -M main
   git remote add origin git@github.com:<вы>/justtld.git
   git push -u origin main
   ```

   > `deployments/sepolia.json` (или `mainnet.json`) должен попасть в репозиторий — это не секрет,
   > это адрес контракта. Файл `.env` и `.env.secrets` — НЕ должны (они в `.gitignore`).

3. Render → **New** → **Blueprint** → выберите репозиторий. Render прочитает `render.yaml`
   и создаст сервис `justtld` (Docker, план Free, регион Frankfurt).
4. Render спросит значения для полей с `sync: false` — введите:

   | Переменная | Значение |
   | --- | --- |
   | `DATABASE_URL` | строка из Neon (шаг 1) |
   | `ADMIN_ADDRESS` | ваш адрес-владелец контракта (тот же, что при деплое) |
   | `NEXT_PUBLIC_APP_URL` | `https://justtld.onrender.com` (подставьте свой URL после создания) |
   | `INDEXER_START_BLOCK` | номер блока деплоя контракта (см. `deployments/sepolia.json`) |

   `SESSION_SECRET` Render сгенерирует сам.

5. **Apply** → начнётся сборка (5–10 минут: ставится Node-окружение и собирается Next.js).
6. Когда статус станет **Live**, откройте `https://<имя>.onrender.com/api/health` — должно быть:

   ```json
   { "status": "ok", "checks": { "database": {"ok": true}, "rpc": {"ok": true},
     "contract": {"ok": true}, "indexer": {"ok": true, "lag": 0} } }
   ```

7. Дальше: откройте сайт, подключите MetaMask, переключите сеть (кнопка «Подключить кошелёк»
   сама предложит добавить сеть/переключиться), зарегистрируйте зону — транзакция уйдёт
   в публичную сеть и будет видна на Etherscan.

### Что нужно знать про бесплатный тариф Render

- Инстанс **засыпает через 15 минут** без запросов. Просыпается ~30–60 секунд на первый запрос.
  Пока он спит, indexer не работает; после пробуждения догоняет цепочку сам (чекпоинт в БД,
  обработка идемпотентная) — потерь нет, просто с задержкой.
- 512 МБ RAM и общий CPU — для реестра на сотни зон более чем достаточно.
- Постоянная работа без засыпания: план Starter ($7/мес), либо отдельный **Background Worker**
  для indexer'а (тоже платный) — тогда в веб-сервисе `RUN_INDEXER_IN_WEB=false`.

## 3. Свой домен на Render (3 минуты)

1. Render → сервис `justtld` → **Settings** → **Custom Domain** → добавьте `justtld.вашдомен`.
2. Render покажет CNAME-запись — пропишите её у регистратора (или в Cloudflare, режим DNS only).
3. Подождите 5–30 минут: Render выпустит TLS-сертификат автоматически.
4. Обновите `NEXT_PUBLIC_APP_URL` на новый адрес и сделайте **Manual Deploy** (эта переменная
   вшивается в бандл при сборке).

## 4. Альтернативы Render

**Railway** — почти то же самое: New Project → Deploy from GitHub → Dockerfile определится сам;
добавьте PostgreSQL-плагин (даст `DATABASE_URL` автоматически) и переменные из `render.yaml`.
**Fly.io** — `fly launch --dockerfile Dockerfile`, затем `fly secrets set DATABASE_URL=… ADMIN_ADDRESS=…`,
`fly deploy`; indexer — вторым процессом (`[processes] web = "npm start"`, `worker = "npm run indexer"`).

## 5. Чек-лист «работает для всех»

- [ ] `GET https://ваш-домен/api/health` → `status: ok`, `indexer.lag` = 0
- [ ] Контракт виден в Etherscan, статус **Verified** (кнопки Read/Write contract)
- [ ] Любой человек без нашего сайта может вызвать `registerTLD` на Etherscan
- [ ] На сайте регистрация проходит из MetaMask, транзакция открывается по ссылке на Etherscan
- [ ] `/zones` показывает зоны, `/zone/<tld>` показывает владельца и историю
- [ ] Админ (`/admin`) входит кошельком-владельцем и блокирует тестовую зону
- [ ] `npm run verify:e2e` (локально, с `DEPLOYMENT_NETWORK=sepolia` и публичным RPC) — зелёный

## 6. Если что-то не работает

| Симптом | Причина / решение |
| --- | --- |
| Build failed: `COPY failed: contracts/artifacts` | устаревший кэш сборки — сделайте **Clear build cache & deploy** |
| `/api/health` → `database.ok = false` | неверный `DATABASE_URL` или не включён SSL: добавьте `?sslmode=require` и `PGSSLMODE=require` |
| `contract.ok = false` | в образ не попал `deployments/<network>.json` (проверьте, что файл в git и `DEPLOYMENT_NETWORK` совпадает с именем файла) |
| `indexer.lag` растёт | публичный RPC ограничивает `eth_getLogs` — поставьте свой бесплатный ключ Alchemy/Infura в `RPC_URL` |
| Регистрация отклоняется `TLDAlreadyExists` | зона уже занята в цепочке — это правильное поведение контракта |
| Сайт «проснулся» через минуту | лимит бесплатного тарифа Render (см. выше) |
