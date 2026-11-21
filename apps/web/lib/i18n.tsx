'use client';

import * as React from 'react';

export type Language = 'ru' | 'en';

type Entry = { ru: string; en: string };

export const dictionary = {
  'app.tagline': {
    ru: 'Своя зона. Свой сайт. Свои правила.',
    en: 'Your zone. Your site. Your rules.',
  },
  'nav.home': { ru: 'Главная', en: 'Home' },
  'nav.store': { ru: 'Магазин', en: 'Store' },
  'nav.auctions': { ru: 'Аукционы', en: 'Auctions' },
  'nav.zones': { ru: 'Зоны', en: 'Zones' },
  'nav.subdomains': { ru: 'Поддомены', en: 'Subdomains' },
  'nav.root': { ru: 'Root DNS', en: 'Root DNS' },
  'nav.register': { ru: 'Регистрация', en: 'Register' },
  'nav.dashboard': { ru: 'Кабинет', en: 'Dashboard' },
  'nav.admin': { ru: 'Админ', en: 'Admin' },
  'nav.docs': { ru: 'Документация', en: 'Docs' },
  'nav.explorer': { ru: 'Обозреватель', en: 'Explorer' },

  'common.connectWallet': { ru: 'Подключить кошелёк', en: 'Connect wallet' },
  'common.wallet': { ru: 'Кошелёк', en: 'Wallet' },
  'common.devWallet': { ru: 'Dev Wallet', en: 'Dev Wallet' },
  'common.injectedWallet': { ru: 'Браузерный кошелёк', en: 'Browser wallet' },
  'common.disconnect': { ru: 'Отключить', en: 'Disconnect' },
  'common.copy': { ru: 'Копировать', en: 'Copy' },
  'common.copied': { ru: 'Скопировано', en: 'Copied' },
  'common.search': { ru: 'Поиск', en: 'Search' },
  'common.loading': { ru: 'Загрузка…', en: 'Loading…' },
  'common.retry': { ru: 'Повторить', en: 'Retry' },
  'common.cancel': { ru: 'Отмена', en: 'Cancel' },
  'common.confirm': { ru: 'Подтвердить', en: 'Confirm' },
  'common.close': { ru: 'Закрыть', en: 'Close' },
  'common.back': { ru: 'Назад', en: 'Back' },
  'common.all': { ru: 'Все', en: 'All' },
  'common.status': { ru: 'Статус', en: 'Status' },
  'common.owner': { ru: 'Владелец', en: 'Owner' },
  'common.zone': { ru: 'Зона', en: 'Zone' },
  'common.zones': { ru: 'Зоны', en: 'Zones' },
  'common.registered': { ru: 'Зарегистрирована', en: 'Registered' },
  'common.expires': { ru: 'Истекает', en: 'Expires' },
  'common.metadata': { ru: 'Метаданные', en: 'Metadata' },
  'common.transaction': { ru: 'Транзакция', en: 'Transaction' },
  'common.block': { ru: 'Блок', en: 'Block' },
  'common.details': { ru: 'Подробнее', en: 'Details' },
  'common.error': { ru: 'Ошибка', en: 'Error' },
  'common.success': { ru: 'Готово', en: 'Done' },
  'common.pending': { ru: 'В обработке', en: 'Pending' },
  'common.confirmed': { ru: 'Подтверждено', en: 'Confirmed' },
  'common.failed': { ru: 'Не выполнено', en: 'Failed' },
  'common.rejected': {
    ru: 'Транзакция отклонена в кошельке',
    en: 'Transaction rejected in wallet',
  },
  'common.notFound': { ru: 'Не найдено', en: 'Not found' },
  'common.language': { ru: 'Язык', en: 'Language' },
  'common.theme': { ru: 'Тема', en: 'Theme' },
  'common.light': { ru: 'Светлая', en: 'Light' },
  'common.dark': { ru: 'Тёмная', en: 'Dark' },
  'common.system': { ru: 'Системная', en: 'System' },
  'common.address': { ru: 'Адрес', en: 'Address' },
  'common.chain': { ru: 'Сеть', en: 'Network' },
  'common.active': { ru: 'Активна', en: 'Active' },
  'common.expired': { ru: 'Истекла', en: 'Expired' },
  'common.blocked': { ru: 'Заблокирована', en: 'Blocked' },
  'common.daysLeft': { ru: 'дней осталось', en: 'days left' },
  'common.of': { ru: 'из', en: 'of' },
  'common.page': { ru: 'Страница', en: 'Page' },
  'common.prev': { ru: 'Назад', en: 'Previous' },
  'common.next': { ru: 'Вперёд', en: 'Next' },
  'common.empty': { ru: 'Пока ничего нет', en: 'Nothing here yet' },
  'common.viewOnExplorer': { ru: 'Открыть в обозревателе', en: 'View in explorer' },
  'common.openZone': { ru: 'Открыть зону', en: 'Open zone' },
  'common.connectedAs': { ru: 'Подключён', en: 'Connected' },
  'common.wrongNetwork': {
    ru: 'Кошелёк подключён к другой сети. Переключитесь на chainId 31337.',
    en: 'Wallet is on another network. Switch to chainId 31337.',
  },
  'common.switchNetwork': { ru: 'Переключить сеть', en: 'Switch network' },
  'common.noWallet': {
    ru: 'Браузерный кошелёк не найден. Установите MetaMask или используйте Dev Wallet.',
    en: 'No browser wallet found. Install MetaMask or use Dev Wallet.',
  },

  'home.badge': { ru: 'Личные зоны · Сайты · DNS', en: 'Custom zones · Sites · DNS' },
  'home.title': { ru: 'Своя доменная зона за минуту', en: 'Your own domain zone in a minute' },
  'home.subtitle': {
    ru: 'Выбирайте красивое имя, запускайте сайт во встроенном хостинге и управляйте DNS — через Google, Email или кошелёк.',
    en: 'Claim a clean name, launch a site on built-in hosting, and manage DNS — with Google, Email, or wallet.',
  },
  'home.searchPlaceholder': {
    ru: 'Введите зону, например .dev',
    en: 'Enter a zone, e.g. .dev',
  },
  'home.check': { ru: 'Проверить', en: 'Check' },
  'home.available': { ru: 'Свободна', en: 'Available' },
  'home.taken': { ru: 'Занята', en: 'Taken' },
  'home.stats': { ru: 'Обзор платформы', en: 'Platform overview' },
  'home.totalZones': { ru: 'Всего зон', en: 'Total zones' },
  'home.activeZones': { ru: 'Активных', en: 'Active' },
  'home.blockedZones': { ru: 'Заблокировано', en: 'Blocked' },
  'home.expiring': { ru: 'Истекают за 30 дней', en: 'Expiring in 30 days' },
  'home.owners': { ru: 'Владельцев', en: 'Owners' },
  'home.events': { ru: 'Событий', en: 'Events' },
  'home.indexed': { ru: 'Блок', en: 'Block' },
  'home.lag': { ru: 'Лаг', en: 'Lag' },
  'home.recent': { ru: 'Недавние зоны', en: 'Recent zones' },
  'home.howItWorks': { ru: 'Как это работает', en: 'How it works' },
  'home.step1.title': { ru: 'Вход за 5 секунд', en: 'Sign in in 5 seconds' },
  'home.step1.text': {
    ru: 'Авторизация через Google, Email или криптокошелёк — выбирайте удобный способ.',
    en: 'Sign in via Google, Email, or Web3 wallet — use whatever fits best.',
  },
  'home.step2.title': { ru: 'Готовый сайт и SSL', en: 'Instant site & SSL' },
  'home.step2.text': {
    ru: 'Загружайте HTML, CSS и JS или ставьте редирект. HTTPS работает сразу после запуска.',
    en: 'Upload HTML, CSS, and JS or set a redirect. HTTPS works out of the box.',
  },
  'home.step3.title': { ru: 'Поддомены и DNS', en: 'Subdomains & DNS' },
  'home.step3.text': {
    ru: 'Создавайте неограниченное число поддоменов и настраивайте записи A, CNAME, TXT и MX.',
    en: 'Create unlimited subdomains and manage real A, CNAME, TXT, and MX records.',
  },
  'home.ctaRegister': { ru: 'Выбрать зону', en: 'Claim a zone' },
  'home.ctaExplore': { ru: 'Каталог зон', en: 'Explore zones' },

  'zones.title': { ru: 'Каталог зон', en: 'Zone catalog' },
  'zones.subtitle': {
    ru: 'Все зоны, синхронизированные из блокчейна. Данные обновляются индексатором.',
    en: 'All zones synced from the blockchain. Data is updated by the indexer.',
  },
  'zones.filter.all': { ru: 'Все', en: 'All' },
  'zones.filter.active': { ru: 'Активные', en: 'Active' },
  'zones.filter.expired': { ru: 'Истёкшие', en: 'Expired' },
  'zones.filter.blocked': { ru: 'Заблокированные', en: 'Blocked' },
  'zones.sort.newest': { ru: 'Сначала новые', en: 'Newest first' },
  'zones.sort.oldest': { ru: 'Сначала старые', en: 'Oldest first' },
  'zones.sort.tld': { ru: 'По алфавиту', en: 'Alphabetical' },
  'zones.sort.expires': { ru: 'Скоро истекают', en: 'Expiring soon' },
  'zones.searchPlaceholder': { ru: 'Поиск по зоне или адресу…', en: 'Search by zone or address…' },
  'zones.emptyTitle': { ru: 'Зон пока нет', en: 'No zones yet' },
  'zones.emptyText': {
    ru: 'Станьте первым: зарегистрируйте свою зону.',
    en: 'Be the first: register your zone.',
  },
  'zones.found': { ru: 'Найдено', en: 'Found' },

  'zone.owner': { ru: 'Владелец', en: 'Owner' },
  'zone.status': { ru: 'Статус', en: 'Status' },
  'zone.registeredAt': { ru: 'Дата регистрации', en: 'Registered at' },
  'zone.expiresAt': { ru: 'Дата истечения', en: 'Expires at' },
  'zone.history': { ru: 'История', en: 'History' },
  'zone.historyEmpty': { ru: 'История событий пуста', en: 'No events yet' },
  'zone.metadataEmpty': { ru: 'Метаданные не заданы', en: 'No metadata set' },
  'zone.transfer': { ru: 'Передать', en: 'Transfer' },
  'zone.renew': { ru: 'Продлить на год', en: 'Renew for a year' },
  'zone.editMetadata': { ru: 'Изменить метаданные', en: 'Edit metadata' },
  'zone.transferTitle': { ru: 'Передача зоны', en: 'Transfer zone' },
  'zone.transferDesc': {
    ru: 'Передача необратима: после подтверждения зона перейдёт новому владельцу.',
    en: 'Transfers are irreversible: after confirmation the zone belongs to the new owner.',
  },
  'zone.recipient': { ru: 'Адрес получателя', en: 'Recipient address' },
  'zone.renewTitle': { ru: 'Продление зоны', en: 'Renew zone' },
  'zone.renewDesc': {
    ru: 'К текущему сроку добавится 365 дней. Стоимость — только gas.',
    en: '365 days will be added to the current term. Cost is gas only.',
  },
  'zone.metadataTitle': { ru: 'Метаданные зоны', en: 'Zone metadata' },
  'zone.metadataDesc': {
    ru: 'Любая строка до 512 байт: JSON, ссылка на сайт, описание.',
    en: 'Any string up to 512 bytes: JSON, website URL, description.',
  },
  'zone.blockedBanner': {
    ru: 'Зона заблокирована владельцем контракта: передача, продление и изменение недоступны.',
    en: 'The zone is blocked by the contract owner: transfer, renewal and updates are disabled.',
  },
  'zone.expiredBanner': {
    ru: 'Срок действия зоны истёк. Продлите её, чтобы вернуть статус «активна».',
    en: 'The zone has expired. Renew it to restore the active status.',
  },
  'zone.notOwnerHint': {
    ru: 'Действия доступны только владельцу зоны.',
    en: 'Actions are available to the zone owner only.',
  },
  'zone.cachedNote': {
    ru: 'Данные кэша индексатора сверяются с контрактом при каждом запросе.',
    en: 'Indexer cache is verified against the contract on every request.',
  },
  'zone.inconsistent': {
    ru: 'Кэш расходится с блокчейном — запустите resync индексатора.',
    en: 'Cache diverges from the chain — run an indexer resync.',
  },
  'zone.chainState': { ru: 'Состояние в блокчейне', en: 'On-chain state' },
  'zone.fromIndexer': { ru: 'Из индексатора', en: 'From indexer' },

  'register.title': { ru: 'Регистрация зоны', en: 'Register a zone' },
  'register.subtitle': {
    ru: 'Зона принадлежит адресу кошелька. Срок — 365 дней, продление добавляет 365 дней.',
    en: 'The zone belongs to your wallet address. Term is 365 days; renewal adds 365 more.',
  },
  'register.label': { ru: 'Желаемая зона', en: 'Desired zone' },
  'register.placeholder': { ru: '.myzone', en: '.myzone' },
  'register.metadataLabel': { ru: 'Метаданные (необязательно)', en: 'Metadata (optional)' },
  'register.metadataPlaceholder': {
    ru: '{"site":"https://example.zone"}',
    en: '{"site":"https://example.zone"}',
  },
  'register.submit': { ru: 'Зарегистрировать за gas', en: 'Register for gas' },
  'register.connectFirst': { ru: 'Сначала подключите кошелёк', en: 'Connect a wallet first' },
  'register.available': { ru: 'Зона свободна', en: 'Zone is available' },
  'register.checking': { ru: 'Проверяем доступность…', en: 'Checking availability…' },
  'register.pending': {
    ru: 'Транзакция отправлена. Ждём подтверждения в блоке…',
    en: 'Transaction sent. Waiting for a block confirmation…',
  },
  'register.success': { ru: 'Зона зарегистрирована!', en: 'Zone registered!' },
  'register.failed': { ru: 'Регистрация не выполнена', en: 'Registration failed' },
  'register.rules': { ru: 'Правила зоны', en: 'Zone rules' },
  'register.rule1': { ru: 'Начинается с точки: .myzone', en: 'Starts with a dot: .myzone' },
  'register.rule2': {
    ru: 'Длина 3–21 символ вместе с точкой',
    en: 'Length 3–21 characters including the dot',
  },
  'register.rule3': { ru: 'Только a-z, 0-9 и дефис', en: 'Only a-z, 0-9 and hyphen' },
  'register.rule4': {
    ru: 'Без дефиса по краям и без «--»',
    en: 'No leading/trailing hyphen and no "--"',
  },
  'register.rule5': { ru: 'Приводится к нижнему регистру', en: 'Normalized to lower case' },
  'register.rule6': {
    ru: 'Зарезервированные и запрещённые имена недоступны',
    en: 'Reserved and blacklisted names are unavailable',
  },
  'register.cost': {
    ru: 'Оплата — только gas локальной сети',
    en: 'You pay gas only on the local network',
  },

  'dashboard.title': { ru: 'Личный кабинет', en: 'Dashboard' },
  'dashboard.subtitle': {
    ru: 'Зоны, которыми владеет подключённый кошелёк, и их состояние.',
    en: 'Zones owned by the connected wallet and their state.',
  },
  'dashboard.connectPrompt': {
    ru: 'Подключите кошелёк, чтобы увидеть свои зоны.',
    en: 'Connect a wallet to see your zones.',
  },
  'dashboard.myZones': { ru: 'Мои зоны', en: 'My zones' },
  'dashboard.mySubdomains': { ru: 'Мои поддомены', en: 'My subdomains' },
  'dashboard.empty': {
    ru: 'У этого адреса пока нет зон.',
    en: 'This address has no zones yet.',
  },
  'dashboard.registerFirst': { ru: 'Зарегистрировать первую зону', en: 'Register your first zone' },
  'dashboard.session': { ru: 'Сессия подписи', en: 'Signature session' },
  'dashboard.signIn': { ru: 'Войти через подпись', en: 'Sign in' },
  'dashboard.signedIn': { ru: 'Подпись подтверждена', en: 'Signature verified' },
  'dashboard.signOut': { ru: 'Выйти', en: 'Sign out' },
  'dashboard.signInHint': {
    ru: 'Подпись сообщения подтверждает владение адресом и включает админ-доступ для owner контракта.',
    en: 'Message signature proves address ownership and enables admin access for the contract owner.',
  },
  'dashboard.expiringSoon': { ru: 'Истекает скоро', en: 'Expiring soon' },

  'admin.title': { ru: 'Админ-панель', en: 'Admin panel' },
  'admin.subtitle': {
    ru: 'Управление реестром доступно только owner контракта.',
    en: 'Registry management is available to the contract owner only.',
  },
  'admin.loginRequired': {
    ru: 'Войдите через подпись кошелька, который является owner контракта.',
    en: 'Sign in with the wallet that owns the contract.',
  },
  'admin.notAdmin': {
    ru: 'Подключённый адрес не является owner контракта.',
    en: 'The connected address is not the contract owner.',
  },
  'admin.contractOwner': { ru: 'Owner контракта', en: 'Contract owner' },
  'admin.paused': { ru: 'Реестр на паузе', en: 'Registry paused' },
  'admin.notPaused': { ru: 'Реестр активен', en: 'Registry active' },
  'admin.pause': { ru: 'Поставить на паузу', en: 'Pause registry' },
  'admin.unpause': { ru: 'Снять паузу', en: 'Unpause registry' },
  'admin.blockZone': { ru: 'Блокировать зону', en: 'Block zone' },
  'admin.unblockZone': { ru: 'Разблокировать зону', en: 'Unblock zone' },
  'admin.reason': { ru: 'Причина блокировки', en: 'Block reason' },
  'admin.reasonPlaceholder': { ru: 'Например: фишинг', en: 'e.g. phishing' },
  'admin.blacklist': { ru: 'Чёрный список слов', en: 'Blacklisted words' },
  'admin.reserved': { ru: 'Зарезервированные зоны', en: 'Reserved zones' },
  'admin.add': { ru: 'Добавить', en: 'Add' },
  'admin.remove': { ru: 'Удалить', en: 'Remove' },
  'admin.resync': { ru: 'Переиндексировать с нуля', en: 'Resync from scratch' },
  'admin.resyncHint': {
    ru: 'Ставит команду индексатору: очистить кэш и заново прочитать все события.',
    en: 'Queues an indexer command: clear the cache and re-read all events.',
  },
  'admin.audit': { ru: 'Аудит действий администратора', en: 'Admin audit log' },
  'admin.auditEmpty': { ru: 'Действий пока не было', en: 'No actions yet' },
  'admin.indexer': { ru: 'Индексатор', en: 'Indexer' },
  'admin.lastIndexed': { ru: 'Последний блок', en: 'Last block' },
  'admin.summary': { ru: 'Требуется вход по подписи', en: 'Signature login required' },

  'tx.pendingTitle': { ru: 'Ожидание подтверждения', en: 'Awaiting confirmation' },
  'tx.confirmedTitle': { ru: 'Транзакция подтверждена', en: 'Transaction confirmed' },
  'tx.failedTitle': { ru: 'Транзакция не выполнена', en: 'Transaction failed' },
  'tx.hash': { ru: 'Хэш транзакции', en: 'Transaction hash' },
  'tx.gasUsed': { ru: 'Использовано gas', en: 'Gas used' },
  'tx.prepare': { ru: 'Подготовка транзакции…', en: 'Preparing transaction…' },
  'tx.signing': {
    ru: 'Подтвердите транзакцию в кошельке…',
    en: 'Confirm the transaction in your wallet…',
  },
  'tx.waiting': { ru: 'Ждём включения в блок…', en: 'Waiting for the block…' },
  'tx.done': { ru: 'Готово', en: 'Done' },

  'docs.title': { ru: 'Документация JustTLD', en: 'JustTLD documentation' },
  'docs.intro': {
    ru: 'JustTLD — децентрализованный реестр пользовательских TLD-зон. Блокчейн хранит владение, PostgreSQL ускоряет поиск и историю.',
    en: 'JustTLD is a decentralized registry of user-owned TLD zones. The blockchain holds ownership; PostgreSQL accelerates search and history.',
  },
  'error.unknown': { ru: 'Неизвестная ошибка', en: 'Unknown error' },
  'error.network': { ru: 'Не удалось связаться с сервером', en: 'Cannot reach the server' },
  'error.rejected': {
    ru: 'Вы отклонили транзакцию в кошельке',
    en: 'You rejected the transaction in your wallet',
  },
  'error.insufficientFunds': {
    ru: 'Недостаточно средств для оплаты gas',
    en: 'Insufficient funds for gas',
  },
} as const satisfies Record<string, Entry>;

export type TranslationKey = keyof typeof dictionary;

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, fallback?: string) => string;
};

const I18nContext = React.createContext<I18nContextValue | null>(null);
const STORAGE_KEY = 'justtld.language';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<Language>('ru');

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'ru' || stored === 'en') {
      setLanguageState(stored);
    } else {
      const browser = navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
      setLanguageState(browser);
    }
  }, []);

  React.useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = React.useCallback((next: Language) => {
    setLanguageState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.cookie = `justtld_lang=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const t = React.useCallback(
    (key: TranslationKey, fallback?: string) => {
      const entry = dictionary[key] as Entry | undefined;
      if (!entry) return fallback ?? key;
      return entry[language] ?? entry.ru;
    },
    [language],
  );

  const value = React.useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n должен использоваться внутри I18nProvider');
  }
  return context;
}
