# Поддомены JustTLD (контракт `JustTLDSubdomains`)

Документ фиксирует архитектурное решение, адреса деплоя, правила и API. Читать вместе с
`README.md` (раздел про контракты) и `docs/DEPLOY-PAAS.md` (деплой и домен).

## Коротко

- Зоны живут в реестре `JustTLDRegistry` (v1, Sepolia: `0x040e0F550dE73Aa796131A3C503B0189303CB298`).
- Поддомены живут в отдельном контракте `JustTLDSubdomains`
  (Sepolia: `0xa6565Dc205b2Af794ff4582dB1A6438CDF922c35`, проверен в Etherscan).
- Поддомен — самостоятельная запись: свой владелец, срок, передача, метаданные, блокировка.
- Резолвер понимает два уровня: `myzone.<домен>` (зона) и `blog.myzone.<домен>` (поддомен).

## Почему два контракта, а не один «v2»

Изначально поддомены были дописаны внутрь реестра (монолитный `JustTLDRegistry` v2,
24 КБ рантайма). Задеплоить его в текущую сеть нельзя:

| Что | Значение |
| --- | --- |
| Лимит газа на транзакцию (EIP-7825) | 16 777 216 |
| Стоимость деплоя 1 байта кода после репрайсинга газа 2026 | ≈ 1 560 газа (было 200) |
| Значит, максимум кода в одном контракте | ≈ 10,4 КБ |
| Монолитный v2 | 23 980 байт → 37,8 млн газа → **выше лимита tx** |

Проверено эмпирически на Sepolia (`eth_estimateGas` двух независимых провайдеров совпадает,
транзакция на 16,7 млн газа уходит в out-of-gas, а 20 и 25 млн отклоняются нодой).
Поэтому поддомены вынесены в отдельный контракт размером 9,4 КБ, а зоны остались в уже
развёрнутом реестре — **перерегистрация девяти существующих зон не нужна**.

Сохранённый черновик монолита: `docs/archive/registry-v2-monolith.sol.txt` (для истории,
не компилируется в общем билде).

## Правила поддомена (контракт)

- Метка: 1–32 символа, `a-z0-9-`, без дефиса по краям и без `--`. Верхний регистр
  нормализуется до нижнего (`Blog` → `blog`).
- Регистрирует **только владелец зоны**. Владелец поддомена может быть другим адресом.
- Срок: `min(now + 365 дней, срок зоны)`. Продление упирается в срок зоны
  (ошибка `SubdomainBeyondZone` — сначала продлите зону).
- Мутировать поддомен (передача, метаданные, продление) может владелец поддомена
  **или** владелец зоны.
- Блокировка — только владелец контракта (`setSubdomainBlocked(zone, label, bool, reason)`).
  Заблокированный поддомен не резолвится (`subdomainOwner() == 0`).
- Метаданные — до 512 байт, поле `url` / `site` / `redirect` включает редирект в резолвере.
- «Поколение» зоны: в записи хранится `zoneOwner` на момент регистрации. Если зону
  перехватили после истечения (reclaim), поддомены прошлого владельца перестают
  резолвиться, и новый владелец может занять те же метки. Отдельного `epoch` в реестре
  не требуется — достаточно сравнения владельцев.

## Ключевые функции

| Функция | Кто | Что делает |
| --- | --- | --- |
| `registerSubdomain(zone, label, metadata)` | владелец зоны | создаёт поддомен |
| `renewSubdomain(zone, label)` | владелец поддомена/зоны | продлевает в пределах срока зоны |
| `transferSubdomain(zone, label, to)` | владелец поддомена/зоны | передаёт владение |
| `setSubdomainMetadata(zone, label, metadata)` | владелец поддомена/зоны | обновляет метаданные |
| `setSubdomainBlocked(zone, label, blocked, reason)` | owner контракта | блокировка/разблокировка |
| `getSubdomain(zone, label)` | все | структура поддомена |
| `subdomainOwner(zone, label)` | все | фактический владелец или `0x0` |
| `subdomainExists` / `isSubdomainBlocked` | все | флаги записи |

События (их индексирует `packages/indexer`): `SubdomainRegistered`, `SubdomainTransferred`,
`SubdomainRenewed`, `SubdomainMetadataUpdated`, `SubdomainBlocked`, `SubdomainUnblocked`.

Перечисление поддоменов списком **намеренно отсутствует** в контракте: возврат массивов
строк стоит дорого по размеру кода, а лимит 10 КБ уже почти исчерпан. Списки отдаёт
индексер: `/api/zones/<tld>/subdomains`.

> Важно: `getTLD` реестра возвращает **структуру** (dynamic tuple). В интерфейсах её нужно
> объявлять как `struct`, а не как плоский список `(address, uint64, …)`: кодировка отличается
> на слово смещения, и вызов падает с `returned an unexpected amount of data`.

## База данных

`packages/db/src/schema.sql`: таблицы `subdomains` (уникальный `name`, `tld`, `label`,
`owner_address`, `zone_owner_address`, `status`, сроки, метаданные) и `subdomain_events`
(история с уникальным ключом `transaction_hash + log_index`).

Применить: `npm run db:migrate` (идемпотентно, `CREATE TABLE IF NOT EXISTS`).

## API

| Метод | Маршрут | Назначение |
| --- | --- | --- |
| GET | `/api/zones/<tld>/subdomains` | список поддоменов зоны (из индексера) |
| GET | `/api/zones/<tld>/subdomains/<label>` | один поддомен: кэш + состояние контракта |
| POST | `/api/subdomains/prepare-registration` | неподписанная tx `registerSubdomain` |
| POST | `/api/subdomains/prepare-renewal` | неподписанная tx `renewSubdomain` |
| POST | `/api/subdomains/prepare-transfer` | неподписанная tx `transferSubdomain` |
| POST | `/api/subdomains/prepare-metadata` | неподписанная tx `setSubdomainMetadata` |

Все prepare-* сначала проверяют состояние контракта и симулируют вызов от имени кошелька,
затем кодируют транзакцию — подписывает только пользователь.
Если контракт поддоменов не подключён, эндпоинты отвечают `501 SUBDOMAINS_DISABLED`.

## Резолвер

`apps/web/middleware.ts` разбирает хост на два уровня:

- `myzone.justtld.online` → карточка зоны `.myzone`;
- `myzone.justtld.online/blog` → карточка поддомена `blog.myzone` (первый сегмент пути на хосте зоны);
- `blog--myzone.justtld.online` → то же самое в виде отдельного хоста (плоский вид, см. ниже);
- `blog.myzone.justtld.online` → то же самое, если для такого имени есть сертификат;
- без своего домена то же самое по путям: `/myzone` и `/myzone/blog`.

### Настоящие двухуровневые имена (включение)

Схема, которая даёт «честный» `blog.femboy.justtld.online` бесплатно: каждую зону
JustTLD делегируем в отдельную зону Cloudflare (`justtld-demo.justtld.online`).
У дочерней зоны свой универсальный сертификат, и он покрывает `*.justtld-demo.justtld.online`
— ровно наш второй уровень. Запросы идут через прокси Cloudflare, поэтому:

- apex дочерней зоны (`justtld-demo.justtld.online`) отдаётся напрямую в Render — его сертификат
  `*.justtld.online` покрывает один уровень;
- `*` в дочерней зоне проксируется через Cloudflare (его сертификат покрывает второй уровень);
- правило `X-Forwarded-Host = http.host` сохраняет исходное имя, правило `Host = justtld.onrender.com`
  пропускает запрос в Render; приложение читает `X-Forwarded-Host` (см. `requestHost` в middleware).

Всё делает `scripts/setup-zone-hosts.mjs`:

```bash
node scripts/setup-zone-hosts.mjs justtld-demo --dry-run
node scripts/setup-zone-hosts.mjs justtld-demo
node scripts/setup-zone-hosts.mjs --all        # все зоны из /api/zones
```

**Статус: не включено.** Проверка на живом аккаунте (ноябрь 2026) упёрлась в две вещи, которых
на бесплатном тарифе нет:

1. создание зоны требует права уровня аккаунта (`com.cloudflare.api.account.zone.create`);
   токен со правами на все зоны (`Zone:Edit`, `DNS:Edit`, `Transform Rules:Edit`,
   `Origin Rules:Edit`) всё равно получает отказ;
2. подмена `Host` в Origin Rules — платная функция: API отвечает
   `not entitled to use the HostHeader override`, без неё Render не примет запрос;
   вместо неё нужен Worker-прокси (бесплатные 100 тыс. запросов в сутки), который сам ходит
   на `justtld.onrender.com` и передаёт исходное имя в `X-Forwarded-Host`.

Плюс поправка по фазам: заголовок запроса меняется в `http_request_late_transform`, а не в
`http_request_transform` (оттуда ответ `header rewrites not allowed`).

Поэтому включёнными остаются три формы без второго уровня: `/зона/метка`, `метка--зона`, `зона.домен/метка`.
Скрипт ниже оставлен как заготовка на случай, если понадобятся настоящие хосты второго уровня.

Скрипту нужен токен Cloudflare (My Profile → API Tokens → Create Custom Token) с правами:

| Разрешение в дашборде | API-имя | Зачем |
| --- | --- | --- |
| Zone → Zone → Edit | `Zone Write` | создать дочернюю зону |
| Zone → DNS → Edit | `DNS Write` | NS-делегирование и записи дочерней зоны |
| Zone → Transform Rules → Edit | `Zone Transform Rules Write` | заголовок `X-Forwarded-Host` |
| Zone → Origin Rules → Edit | `Zone Origin Rules Write` | подмена `Host` на адрес Render |

Ресурсы зон: **All zones from an account**. Токен «только DNS одной зоны» не подойдёт:
без права создавать зоны скрипт падает на `com.cloudflare.api.account.zone.create`.
Права `Config Rules` для этого бесполезны — это другой продукт Cloudflare.
Сертификат дочерней зоны Cloudflare выпускает обычно за 5–15 минут после делегирования NS.

### Почему поддомен в хосте пишется через `--`

Сертификат Render (и вообще любой публичный CA) покрывает только один уровень: `*.justtld.online`.
Имя `blog.myzone.justtld.online` — это два уровня, и выдать на него сертификат нельзя ни в Let's Encrypt
(маски только на один уровень), ни в Universal SSL у Cloudflare. Варианта два: платный
Cloudflare for SaaS с отдельным сертификатом на каждое имя, либо плоская запись одним уровнем.
Выбран второй: `blog--myzone.justtld.online` работает с уже выпущенным сертификатом.
Двойной дефис недопустим ни в метке поддомена, ни в имени зоны, поэтому разбор однозначный.
Двухуровневый вид в middleware поддержан — он заработает сам, если появится сертификат на такой хост.

Служебные хосты (`www`, `api`, `admin`, `app`) и зарезервированные пути (`/zones`, `/register`,
`/docs`, `/api/*` …) резолвер не перехватывает.

## UI

Страница зоны (`/zone/<tld>`) содержит блок «Поддомены»: список с владельцем и сроком, кнопка
«Создать» для владельца зоны, продление, передача и редактирование метаданных.

## Деплой

```bash
cd contracts
npx hardhat compile
npx hardhat run scripts/deploy-subdomains.ts --network sepolia   # пишет deployments/sepolia.subdomains.json
npx hardhat verify --network sepolia <address> <registry> <admin>
```

Скрипт сам считает `estimateGas`, ставит лимит +5 % и падает, если контракт не влезает в лимит
транзакции. Адрес реестра берётся из `deployments/<сеть>.json`.

## Переменные окружения

`SUBDOMAINS_ADDRESS` — переопределяет адрес из файла деплоя (удобно на PaaS).
`SUBDOMAINS_DEPLOYMENT_FILE` — явный путь к JSON деплоя.

## Тесты

```bash
cd contracts && npx hardhat test        # 64 теста: реестр (49) + поддомены (15)
```

Покрыто: регистрация, права, дубликаты, валидация метки, передача, продление с клампом по зоне,
метаданные и лимит 512 байт, блокировка, перехват зоны новым владельцем, истёкшая зона.
