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

## 0.9. Подключение кошелька с телефона: WalletConnect v2

Обычный Chrome/Safari на телефоне не даёт сайту `window.ethereum`, поэтому помимо инъекции
(расширение MetaMask, Brave, встроенный браузер MetaMask) добавлен WalletConnect:

- пункт меню **«MetaMask на телефоне»** → модальное окно с QR-кодом и кнопкой «Copy link»;
- на узком экране в шапке появилась отдельная иконочная кнопка кошелька (`compact`), чтобы
  подключение занимало один тап, а не пряталось в бургер-меню;
- после подтверждения в кошельке сессия восстанавливается при перезагрузке страницы
  (`localStorage: justtld.wallet → kind: walletconnect`);
- CSP расширен: `connect-src wss://relay.walletconnect.org` (relay), `font-src https://fonts.reown.com`,
  `frame-src https://verify.walletconnect.*` — без этого браузер блокировал сопряжение.

Переменная окружения: `NEXT_PUBLIC_WC_PROJECT_ID` (публичный Project ID из cloud.reown.com,
вшивается в бандл при сборке — как все `NEXT_PUBLIC_*`). Пустое значение = пункт меню скрыт,
сайт продолжает работать через расширение.

Проверка: `npm run build && PORT=3200 npm start`, затем `npm run test:walletconnect` —
скрипт открывает сайт в Chromium как мобильный Chrome (без `window.ethereum`), проверяет кнопку в шапке,
пункт меню, появление модалки, отрисовку QR, websocket к relay и отсутствие нарушений CSP.

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

### Не засыпать: keep-alive (2026-11-20)

Два независимых слоя:

| Слой | Где | Как | Проверено |
| --- | --- | --- | --- |
| Внутренний | `scripts/keep-alive.mjs` в контейнере | каждые **870 с (14 мин 30 с)** GET на `${RENDER_EXTERNAL_URL}/api/health` — запрос идёт через прокси Render и считается входящим | пинг `23:45:18 UTC` → HTTP 200, 904 мс, `pings: 1`, `failures: 0` |
| Внешний | `.github/workflows/keep-alive.yml` | GitHub Actions каждые 12 минут дёргает `/api/health` из своей инфраструктуры | workflow зарегистрирован и активен |

Включается автоматически, если Render установил `RENDER_EXTERNAL_URL` (переменная блюпринта не обязательна):
`KEEP_ALIVE_ENABLED=auto|true|false`, интервал — `KEEP_ALIVE_INTERVAL_SECONDS`.

Состояние видно снаружи в `GET /api/health` → `keepAlive.heartbeat`:
`startedAt`, `lastPingAt`, `lastStatus`, `lastLatencyMs`, `pings`, `failures`, `ageSeconds`.
Если `ageSeconds` когда-нибудь превысит ~900 — значит инстанс всё-таки спал и его нужно будить внешним слоем.

Ограничения: бесплатный план даёт 750 инстанс-часов в месяц (24/7 ≈ 730–744), а «сон» — документированная
особенность тарифа, которую самопинг обходит без гарантий со стороны Render. Гарантированный вариант — платный
инстанс ($7/мес).

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

## 3. Свой домен и резолвер имён (3 минуты + DNS)

Резолвер превращает реестр в настоящую систему имён: `myzone.вашдомен` открывается в браузере
и показывает зону `.myzone` — карточку владельца либо редирект на сайт, указанный в метаданных.
Имя резолвит наша программа, а не DNS: запрос на любой поддомен приходит на тот же сервис
Render, а `middleware.ts` смотрит заголовок `Host` и переписывает путь на `/resolve?zone=…`.
Поэтому в DNS нужна **одна wildcard-запись**, а не запись на каждую зону.

### 3.1. Что нажать в Render

1. Render → сервис `justtld` → **Settings** → **Custom Domains** → **Add Custom Domain**.
2. Добавьте **два** имени:
   - `justtld.вашдомен` — основной адрес приложения;
   - `*.justtld.вашдомен` — wildcard для зон (Render поддерживает wildcard и выпускает на него
     бесплатный TLS-сертификат Let's Encrypt / Google Trust Services).
3. Render покажет CNAME-записи — пропишите их у регистратора (см. ниже).
4. Дождитесь статуса **Verified** у обоих имён (5–30 минут; DNS может обновляться до часа).

### 3.2. Что прописать у регистратора (DNS)

| Тип | Имя (Host) | Значение | Зачем |
| --- | --- | --- | --- |
| CNAME | `justtld` | `justtld.onrender.com` | основной адрес |
| CNAME | `*` | `justtld.onrender.com` | все зоны `*.justtld.вашдомен` |
| CNAME | `www` (по желанию) | `justtld.onrender.com` | привычный префикс |

Если домен — апекс (`вашдомен` без поддомена) и регистратор не умеет CNAME на апексе, используйте
ALIAS/ANAME (Cloudflare, Namecheap) или просто оставьте приложение на `justtld.вашдомен` —
для резолвера апекс не нужен.

> **Cloudflare:** ставьте записи в режиме **DNS only** (серая тучка). При включённом прокси
> Render не увидит свой сертификат и проверка домена не пройдёт. Если прокси нужен, добавьте
> CAA-записи `letsencrypt.org` и `pki.goog` (в том числе `issuewild`).

### 3.2-бис. Бесплатный вариант: поддомен без покупки домена

Денег платить не нужно, но понадобятся **два бесплатных аккаунта**: DigitalPlat FreeDomain
(даёт сам домен) и Cloudflare (даёт DNS с wildcard — без него `*.домен` не сделать).
Проверено 2026-11-20: `.dpdns.org` и `.qzz.io` есть в Public Suffix List, поэтому Cloudflare
принимает их как обычную зону.

**Шаг 1. Получить домен (≈5 минут).**

1. Откройте <https://dash.domain.digitalplat.org/> → **Sign up** (нужен только e-mail).
2. **Register** → введите имя `justtld` → суффикс **`.dpdns.org`** (бесплатный) → **Check availability**.
3. **DNS-поля пока оставьте пустыми** → **Register**. Домен `justtld.dpdns.org` — ваш на год,
   продление бесплатное, но **ручное** (напоминание за 120 дней). Ставьте себе напоминание.
4. Скопируйте домен из списка — он понадобится ниже.

**Шаг 2. Подключить Cloudflare (≈5 минут).**

1. <https://dash.cloudflare.com/> → **Add a site** → введите `justtld.dpdns.org` → план **Free**.
2. Cloudflare покажет два nameserver-а вида `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`.
3. Вернитесь в DigitalPlat → у домена **Manage / Edit DNS** → впишите **оба** NS → сохраните.
4. Подождите 5–30 минут, пока Cloudflare напишет **Active** (проверить: `nslookup -type=ns justtld.dpdns.org`).

**Шаг 3. Записи в Cloudflare DNS** (прокси **выключен**, серая тучка — иначе Render не выпустит
сертификат):

| Тип | Name | Content | Зачем |
| --- | --- | --- | --- |
| CNAME | `@` | `justtld.onrender.com` | основной адрес приложения (корень зоны обязан смотреть на Render) |
| CNAME | `*` | `justtld.onrender.com` | все зоны: `myzone.justtld.dpdns.org` |
| CNAME | `_acme-challenge` | `justtld.verify.renderdns.com` | Render выпускает wildcard-сертификат (Let's Encrypt) |
| CNAME | `_cf-custom-hostname` | `justtld.hostname.renderdns.com` | подтверждение владения для DDoS-щита Render |

Значения `verify.renderdns.com`/`hostname.renderdns.com` Render показывает **в дашборде** рядом с
добавленным доменом — если буквы не совпали с таблицей, берите из дашборда.

**Шаг 4. Добавить домены в Render.**

1. Render → сервис `justtld` → **Settings** → **Custom Domains**:
   - `justtld.dpdns.org` — основной адрес;
   - `*.justtld.dpdns.org` — wildcard для зон.
2. Для каждого нажмите **Verify**. Статус должен стать **Verified**, рядом появится сертификат.
3. Free-план Render включает **2 своих домена**. Если Render сам добавит `www.justtld.dpdns.org`
   и вы упрётесь в лимит, лишний домен стоит **$0.25/мес** — это единственная возможная плата
   в бесплатном варианте. `world`-запись `www` можно не добавлять: wildcard её и так покрывает.

**Шаг 5. Переменные и проверка.** — как в §3.3–3.4, только подставьте `justtld.dpdns.org`.

Итог: `justtld.dpdns.org` — приложение, `myzone.justtld.dpdns.org` — зона `.myzone`,
`любое-свободное.justtld.dpdns.org` — предложение зарегистрировать. Бесплатно, но с двумя
аккаунтами и ручным продлением домена раз в год.

### 3.3. Переменные окружения

Render → сервис → **Environment**:

| Переменная | Значение | Нужна пересборка |
| --- | --- | --- |
| `RESOLVER_DOMAIN` | `justtld.вашдомен` (без `www`, без слэша) | нет |
| `NEXT_PUBLIC_APP_URL` | `https://justtld.вашдомен` | **да** — вшивается в бандл |

После смены `NEXT_PUBLIC_APP_URL` нажмите **Manual Deploy → Deploy latest commit**
(или **Clear build cache & deploy**, если старый адрес остался в ссылках).

### 3.4. Проверка

```bash
# карточка существующей зоны
curl -sI https://myzone.justtld.вашдомен | head -1          # 200
# свободное имя — предложение зарегистрировать
curl -s https://freename.justtld.вашдомен | grep -o 'Зона свободна'
# зона с url в метаданных — редирект
curl -sI https://justtld-demo.justtld.вашдомен | grep -i '^location'
# служебные поддомены не перехватываются
curl -sI https://www.justtld.вашдомен | head -1              # 200, главная сайта
# всё то же одним скриптом (сам определит, что домен настоящий, и пойдёт по DNS)
npm run test:resolver -- https://justtld.вашдомен justtld.вашдомен
```

Локально то же самое без DNS — скрипт подставляет заголовок `Host`:

```bash
PORT=3300 RESOLVER_DOMAIN=localtest.test DATABASE_URL=… npm start
npm run test:resolver -- http://127.0.0.1:3300 localtest.test
```

| Симптом | Причина / решение |
| --- | --- |
| `myzone.домен` — `DNS_PROBE_FINISHED_NXDOMAIN` | нет wildcard-записи `*` CNAME или она ещё не разошлась |
| `SSL handshake failed` / `NET::ERR_CERT_COMMON_NAME_INVALID` | wildcard-домен ещё не **Verified** в Render |
| Поддомен открывает главную, а не зону | `RESOLVER_DOMAIN` не задан или не совпадает с доменом в адресной строке |
| Зона открылась, но ссылки ведут на `onrender.com` | не обновили `NEXT_PUBLIC_APP_URL` и не пересобрали |

### 3.5. Ограничения резолвера

- Один уровень поддомена: `a.b.домен` считается обычным адресом сайта (резолвер пропускает).
- Служебные имена `www`, `api`, `admin`, `app` не резолвятся — они остаются за приложением.
- Резолвер только читает: регистрация и продление — на основном домене приложения.
- Имя резолвится, пока зона активна. После истечения срока поддомен показывает «срок истёк»
  и кнопку регистрации — но по-прежнему не отдаёт чужой контент.

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
