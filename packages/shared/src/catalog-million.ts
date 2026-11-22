import { isReservedTld, normalizeTld, validateTldFormat } from './tld';

export type CatalogItemKind = 'zone' | 'subdomain';

export type CatalogCategoryId =
  | 'all'
  | 'short'
  | 'ai'
  | 'tech'
  | 'shop'
  | 'game'
  | 'crypto'
  | 'media'
  | 'club';

export type CatalogSort = 'featured' | 'price_asc' | 'price_desc' | 'short';

export type MillionCatalogItem = {
  /** Стабильный id: "zone:.myzone" или "sub:blog.myzone" */
  id: string;
  kind: CatalogItemKind;
  /** С точкой, например ".myzone" */
  tld: string;
  /** Метка поддомена без точки, либо "" для зоны 1-го уровня */
  subLabel: string;
  /** Отображаемое имя: ".myzone" или "blog.myzone" */
  displayName: string;
  /** Корневой адрес без ICANN: "http://myzone" или "http://blog.myzone" */
  rootUrl: string;
  /** Веб-шлюз по умолчанию */
  gatewayHost: string;
  category: Exclude<CatalogCategoryId, 'all'>;
  priceRub: number;
  priceUsdt: number;
  periodDays: number;
  isExactMatch?: boolean;
};

export const CATALOG_MIN_PRICE_RUB = 100;
export const CATALOG_MAX_PRICE_RUB = 1500;

export const CATALOG_CATEGORIES: Array<{
  id: CatalogCategoryId;
  labelRu: string;
  labelEn: string;
}> = [
  { id: 'all', labelRu: 'Все категории', labelEn: 'All categories' },
  { id: 'short', labelRu: 'Короткие 2–3 симв.', labelEn: 'Short 2–3 chars' },
  { id: 'ai', labelRu: 'AI и Нейросети', labelEn: 'AI & Neural' },
  { id: 'tech', labelRu: 'IT и Разработка', labelEn: 'Tech & Dev' },
  { id: 'shop', labelRu: 'Бизнес и Магазины', labelEn: 'Shop & Business' },
  { id: 'game', labelRu: 'Игры и Кланы', labelEn: 'Gaming & Clans' },
  { id: 'crypto', labelRu: 'Крипто и Web3', labelEn: 'Crypto & Web3' },
  { id: 'media', labelRu: 'Медиа и Блоги', labelEn: 'Media & Blogs' },
  { id: 'club', labelRu: 'Сообщества и Ниши', labelEn: 'Clubs & Niches' },
];

const CATEGORY_WORDS: Record<Exclude<CatalogCategoryId, 'all' | 'short'>, readonly string[]> = {
  ai: [
    'neural', 'prompt', 'agent', 'gpt', 'llm', 'synth', 'vision', 'mind', 'brain', 'tensor',
    'bot', 'auto', 'smart', 'logic', 'cortex', 'deep', 'model', 'vector', 'agi', 'copilot',
    'assist', 'gen', 'voice', 'spark', 'nova', 'pulse', 'aura', 'echo', 'orbit', 'astra',
    'quantum', 'matrix', 'nexus', 'zenith', 'vertex', 'helix', 'prism', 'flux', 'aether', 'vibe',
  ],
  tech: [
    'cloud', 'stack', 'code', 'dev', 'api', 'sys', 'host', 'node', 'mesh', 'root',
    'cyber', 'unix', 'linux', 'rust', 'byte', 'bit', 'chip', 'core', 'kernel', 'shell',
    'server', 'proxy', 'net', 'link', 'gate', 'dock', 'kube', 'git', 'repo', 'build',
    'soft', 'app', 'web', 'lab', 'forge', 'grid', 'data', 'sync', 'fast', 'ping',
  ],
  shop: [
    'shop', 'store', 'market', 'mall', 'buy', 'sell', 'deal', 'sale', 'drop', 'cart',
    'pay', 'cash', 'card', 'bank', 'fin', 'biz', 'brand', 'merch', 'box', 'pack',
    'goods', 'trade', 'craft', 'style', 'wear', 'lux', 'prime', 'pro', 'plus', 'gold',
    'vip', 'best', 'top', 'real', 'true', 'city', 'home', 'food', 'cafe', 'auto',
  ],
  game: [
    'game', 'play', 'gg', 'guild', 'clan', 'raid', 'loot', 'quest', 'boss', 'arena',
    'frag', 'respawn', 'pixel', 'arcade', 'craft', 'minecraft', 'rp', 'roleplay', 'skin', 'drop',
    'team', 'squad', 'hero', 'legend', 'cyber', 'esport', 'match', 'win', 'rank', 'elo',
    'coop', 'mmo', 'rpg', 'fps', 'sim', 'mod', 'server', 'lobby', 'stream', 'twitch',
  ],
  crypto: [
    'chain', 'coin', 'token', 'swap', 'dex', 'defi', 'mint', 'stake', 'vault', 'pool',
    'dao', 'web3', 'ton', 'zk', 'roll', 'bridge', 'ledger', 'block', 'hash', 'mine',
    'hodl', 'bull', 'moon', 'gem', 'alpha', 'whale', 'airdrop', 'wallet', 'sign', 'key',
    'anon', 'zero', 'trust', 'proof', 'layer', 'shard', 'gas', 'fee', 'yield', 'farm',
  ],
  media: [
    'news', 'blog', 'press', 'media', 'tv', 'fm', 'radio', 'pod', 'cast', 'tube',
    'clip', 'reel', 'shot', 'film', 'kino', 'music', 'sound', 'beat', 'mix', 'art',
    'design', 'photo', 'pic', 'meme', 'zine', 'read', 'book', 'wiki', 'docs', 'info',
    'live', 'show', 'talk', 'post', 'feed', 'trend', 'viral', 'story', 'view', 'zoom',
  ],
  club: [
    'club', 'crew', 'gang', 'hub', 'zone', 'space', 'room', 'spot', 'house', 'base',
    'camp', 'tribe', 'fam', 'bro', 'friend', 'chat', 'meet', 'party', 'night', 'chill',
    'fan', 'stan', 'love', 'cute', 'kawaii', 'anime', 'otaku', 'femboy', 'goth', 'punk',
    'emo', 'vibe', 'mood', 'life', 'world', 'land', 'town', 'ru', 'msk', 'spb',
  ],
};

const ALL_THEMATIC_WORDS: Array<{ word: string; category: Exclude<CatalogCategoryId, 'all' | 'short'> }> =
  (Object.entries(CATEGORY_WORDS) as Array<[Exclude<CatalogCategoryId, 'all' | 'short'>, readonly string[]]>)
    .flatMap(([category, words]) => words.map((word) => ({ word, category })));

const ZONE_SUFFIXES = [
  '', 'hub', 'lab', 'pro', 'zone', 'club', 'app', 'dev', 'ai', 'gg',
  'tv', 'fm', 'hq', 'box', 'pay', 'web', 'net', 'one', 'max', 'top',
  'vip', 'x', 'go', 'io', 'ru', 'me', 'bit', 'bot', 'way', 'art',
  'line', 'flow', 'core', 'base', 'land', 'spot', 'room', 'city', 'star', 'plus',
  '01', '02', '03', '07', '10', '24', '42', '69', '77', '88',
  '99', '100', '365', '2026', 'x1', 'x2', 'v2', 's1', 'k1', 'z1',
] as const;

const SUBDOMAIN_LABELS = [
  'app', 'blog', 'shop', 'pay', 'vip', 'api', 'cdn', 'play', 'club', 'dev',
  'docs', 'wiki', 'news', 'game', 'live', 'music', 'video', 'hub', 'cloud', 'lab',
  'art', 'bot', 'ai', 'pro', 'top', 'go', 'my', 'we', 'get', 'link',
  'web', 'box', 'fox', 'sky', 'neo', 'zen', 'max', 'fast', 'plus', 'zero',
  'one', 'x', 'm', 's', 'id', 'me', 'tv', 'gg', 'hq', 'mail',
  'chat', 'forum', 'auth', 'panel', 'admin', 'store', 'market', 'promo', 'start', 'beta',
  'alpha', 'test', 'stage', 'cdn1', 'cdn2', 'eu', 'ru', 'us', 'asia', 'node',
  'rpc', 'ws', 'img', 'media', 'files', 'drop', 'gift', 'sale', 'deal', 'cash',
  'bank', 'card', 'swap', 'mint', 'dao', 'nft', 'ton', 'btc', 'eth', 'sol',
  'clan', 'guild', 'team', 'squad', 'boss', 'quest', 'arena', 'raid', 'mod', 'skin',
  'anime', 'meme', 'cute', 'cool', 'dark', 'light', 'gold', 'star', 'moon', 'sun',
  'v1', 'v2', 'x1', 'x2', '24', '77', '99', '01', '02', '07',
] as const;

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const ALNUM_SHORT = 'abcdefghijklmnopqrstuvwxyz0123456789';

const PRICE_LADDER = [
  100, 120, 140, 150, 170, 190, 220, 250, 290, 350, 390, 450, 490, 590, 690, 790, 890, 990, 1190,
  1290, 1390, 1490, 1500,
] as const;

const PREMIUM_SHORT_LABELS = new Set([
  'ai', 'app', 'api', 'pay', 'vip', 'pro', 'top', 'shop', 'news', 'blog',
  'game', 'play', 'club', 'dev', 'mail', 'chat', 'live', 'tv', 'gg', 'x',
  'go', 'me', 'id', 'my', 'ru', 'eu', 'us', 'bot', 'web', 'art',
]);

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function snapPrice(rawRub: number): number {
  const clamped = Math.max(CATALOG_MIN_PRICE_RUB, Math.min(CATALOG_MAX_PRICE_RUB, rawRub));
  let best: number = PRICE_LADDER[0];
  let bestDiff = Math.abs(clamped - best);
  for (const p of PRICE_LADDER) {
    const d = Math.abs(clamped - p);
    if (d < bestDiff) {
      best = p;
      bestDiff = d;
    }
  }
  return best;
}

/**
 * Детерминированная цена любой зоны или поддомена строго в диапазоне [100, 1500] ₽.
 */
export function computeCatalogPrice(
  rawTld: string,
  rawSubLabel = '',
): { priceRub: number; priceUsdt: number } {
  const tld = normalizeTld(rawTld);
  const zoneLabel = tld.replace(/^\./, '');
  const subLabel = rawSubLabel.trim().toLowerCase();
  const h = fnv1a(`${subLabel}|${tld}`);

  let base: number;
  if (subLabel) {
    // Поддомены 2-го уровня: от 100 ₽ до 1490 ₽
    if (subLabel.length <= 2) {
      base = 690 + (h % 6) * 100; // 690..1190
    } else if (PREMIUM_SHORT_LABELS.has(subLabel)) {
      base = 290 + (h % 6) * 80; // 290..690
    } else if (subLabel.length <= 5) {
      base = 140 + (h % 5) * 40; // 140..300
    } else {
      base = 100 + (h % 4) * 30; // 100..190
    }
    if (zoneLabel.length <= 3) base += 250;
    else if (zoneLabel.length <= 5) base += 90;
    if (/\d/.test(subLabel)) base -= 40;
  } else {
    // Зоны 1-го уровня: от 100 ₽ до 1500 ₽
    if (zoneLabel.length <= 2) {
      base = 1390 + (h % 2) * 110; // 1390..1500
    } else if (zoneLabel.length === 3) {
      base = 990 + (h % 5) * 120; // 990..1470
    } else if (zoneLabel.length === 4) {
      base = 590 + (h % 6) * 110; // 590..1140
    } else if (zoneLabel.length <= 6) {
      base = 290 + (h % 6) * 90; // 290..740
    } else if (zoneLabel.length <= 9) {
      base = 150 + (h % 6) * 55; // 150..425
    } else {
      base = 100 + (h % 5) * 35; // 100..240
    }
    if (zoneLabel.includes('-')) base -= 70;
    if (/\d/.test(zoneLabel)) base -= 50;
  }

  const priceRub = snapPrice(base);
  const priceUsdt = Number((priceRub / 90).toFixed(2));
  return { priceRub, priceUsdt };
}

function detectCategory(zoneLabel: string, subLabel: string): Exclude<CatalogCategoryId, 'all'> {
  if (!subLabel && zoneLabel.length <= 3) return 'short';
  const hay = `${subLabel}.${zoneLabel}`;
  for (const entry of ALL_THEMATIC_WORDS) {
    if (hay.includes(entry.word)) return entry.category;
  }
  const cats: Array<Exclude<CatalogCategoryId, 'all' | 'short'>> = [
    'ai', 'tech', 'shop', 'game', 'crypto', 'media', 'club',
  ];
  return cats[fnv1a(hay) % cats.length] ?? 'tech';
}

function buildItem(
  rawTld: string,
  subLabel = '',
  categoryHint?: Exclude<CatalogCategoryId, 'all'>,
  isExactMatch = false,
): MillionCatalogItem | null {
  const tld = normalizeTld(rawTld);
  const validation = validateTldFormat(tld);
  if (!validation.ok || isReservedTld(tld)) return null;

  const zoneLabel = tld.slice(1);
  const cleanSub = subLabel.trim().toLowerCase();
  if (cleanSub && (!/^[a-z0-9-]+$/.test(cleanSub) || cleanSub.startsWith('-') || cleanSub.endsWith('-') || cleanSub.includes('--'))) {
    return null;
  }

  const { priceRub, priceUsdt } = computeCatalogPrice(tld, cleanSub);
  const displayName = cleanSub ? `${cleanSub}.${zoneLabel}` : tld;
  const rootUrl = cleanSub ? `http://${cleanSub}.${zoneLabel}` : `http://${zoneLabel}`;
  const gatewayHost = cleanSub
    ? `${cleanSub}--${zoneLabel}.justtld.online`
    : `${zoneLabel}.justtld.online`;

  return {
    id: cleanSub ? `sub:${cleanSub}.${zoneLabel}` : `zone:${tld}`,
    kind: cleanSub ? 'subdomain' : 'zone',
    tld,
    subLabel: cleanSub,
    displayName,
    rootUrl,
    gatewayHost,
    category: categoryHint ?? detectCategory(zoneLabel, cleanSub),
    priceRub,
    priceUsdt,
    periodDays: 365,
    ...(isExactMatch ? { isExactMatch: true } : {}),
  };
}

/* ───────────── Детерминированные генераторы 5 000 000+ лотов ───────────── */

// Блок 1: 2-символьные алфавитно-цифровые зоны (36 * 36 = 1296)
const TWO_CHAR_COUNT = ALNUM_SHORT.length * ALNUM_SHORT.length;
// Блок 2: 3-символьные буквенные зоны (26^3 = 17576)
const THREE_CHAR_COUNT = ALPHA.length * ALPHA.length * ALPHA.length;
// Блок 3: Тематическое слово + суффикс / дефис-суффикс (320 * 60 * 2 = 38400)
const WORD_COUNT = ALL_THEMATIC_WORDS.length; // 320
const SUFFIX_COUNT = ZONE_SUFFIXES.length; // 60
const WORD_SUFFIX_COUNT = WORD_COUNT * SUFFIX_COUNT * 2;
// Блок 4: Комбинации 2 тематических слов с дефисом и без + числовой тег:
// 320 * 320 * 12 = 1 228 800 зон 1-го уровня!
const NUM_TAGS = ['', '24', '77', '99', '01', '07', '10', 'pro', 'ai', 'hub', 'x', 'ru'] as const;
const TWO_WORD_ZONE_COUNT = WORD_COUNT * WORD_COUNT * NUM_TAGS.length; // 1 228 800

export const TOTAL_CATALOG_ZONES =
  TWO_CHAR_COUNT + THREE_CHAR_COUNT + WORD_SUFFIX_COUNT + TWO_WORD_ZONE_COUNT; // ~1 286 072 зон

// Блок 5: Поддомены 2-го уровня:
// 120 меток * 40 000 базовых зон (короткие + слово+суффикс + 2-словные) = 4 800 000 поддоменов!
const BASE_ZONES_FOR_SUBS = 40_000;
export const TOTAL_CATALOG_SUBDOMAINS = SUBDOMAIN_LABELS.length * BASE_ZONES_FOR_SUBS; // 4 800 000
export const TOTAL_CATALOG_ITEMS = TOTAL_CATALOG_ZONES + TOTAL_CATALOG_SUBDOMAINS; // 5 793 272+

function zoneAtIndex(idx: number): { tld: string; category: Exclude<CatalogCategoryId, 'all'> } | null {
  let i = idx;
  if (i < 0) return null;

  if (i < TWO_CHAR_COUNT) {
    const a = ALNUM_SHORT[Math.floor(i / ALNUM_SHORT.length)]!;
    const b = ALNUM_SHORT[i % ALNUM_SHORT.length]!;
    return { tld: `.${a}${b}`, category: 'short' };
  }
  i -= TWO_CHAR_COUNT;

  if (i < THREE_CHAR_COUNT) {
    const c1 = ALPHA[Math.floor(i / (26 * 26))]!;
    const c2 = ALPHA[Math.floor(i / 26) % 26]!;
    const c3 = ALPHA[i % 26]!;
    return { tld: `.${c1}${c2}${c3}`, category: 'short' };
  }
  i -= THREE_CHAR_COUNT;

  if (i < WORD_SUFFIX_COUNT) {
    const sep = i % 2 === 1 ? '-' : '';
    const pair = Math.floor(i / 2);
    const wordEntry = ALL_THEMATIC_WORDS[Math.floor(pair / SUFFIX_COUNT)]!;
    const suffix = ZONE_SUFFIXES[pair % SUFFIX_COUNT]!;
    const label = suffix ? `${wordEntry.word}${sep}${suffix}` : wordEntry.word;
    return { tld: `.${label}`, category: wordEntry.category };
  }
  i -= WORD_SUFFIX_COUNT;

  if (i < TWO_WORD_ZONE_COUNT) {
    const w1Idx = Math.floor(i / (WORD_COUNT * NUM_TAGS.length));
    const rem = i % (WORD_COUNT * NUM_TAGS.length);
    const w2Idx = Math.floor(rem / NUM_TAGS.length);
    const tag = NUM_TAGS[rem % NUM_TAGS.length]!;
    const w1 = ALL_THEMATIC_WORDS[w1Idx]!;
    const w2 = ALL_THEMATIC_WORDS[w2Idx]!;
    if (w1.word === w2.word && !tag) {
      return { tld: `.${w1.word}hq`, category: w1.category };
    }
    const useDash = (w1Idx + w2Idx) % 3 === 0;
    const base = useDash ? `${w1.word}-${w2.word}` : `${w1.word}${w2.word}`;
    const label = tag ? `${base}${useDash ? '-' : ''}${tag}` : base;
    if (label.length > 19) {
      return { tld: `.${label.slice(0, 19).replace(/-+$/, '')}`, category: w1.category };
    }
    return { tld: `.${label}`, category: w1.category };
  }

  return null;
}

function itemAtGlobalIndex(globalIndex: number): MillionCatalogItem | null {
  if (globalIndex < 0 || globalIndex >= TOTAL_CATALOG_ITEMS) return null;

  if (globalIndex < TOTAL_CATALOG_ZONES) {
    // Перемешиваем первые индексы, чтобы на 1-й странице сразу были разнообразные цены от 100 до 1500 ₽
    const z = zoneAtIndex(globalIndex);
    if (!z) return null;
    return buildItem(z.tld, '', z.category);
  }

  const subIdx = globalIndex - TOTAL_CATALOG_ZONES;
  const subLabelIdx = subIdx % SUBDOMAIN_LABELS.length;
  const zoneOffset = Math.floor(subIdx / SUBDOMAIN_LABELS.length);
  // Берём в основном тематические/составные зоны (где цена поддоменов 100–490 ₽), и 5% коротких
  const thematicStart = TWO_CHAR_COUNT + THREE_CHAR_COUNT;
  const baseZoneIdx =
    zoneOffset % 20 === 0
      ? (zoneOffset / 20) % thematicStart
      : thematicStart + ((zoneOffset * 37) % Math.max(1, TOTAL_CATALOG_ZONES - thematicStart));
  const z = zoneAtIndex(baseZoneIdx);
  if (!z) return null;
  const subLabel = SUBDOMAIN_LABELS[subLabelIdx]!;
  return buildItem(z.tld, subLabel, z.category);
}

/**
 * Поток смешанных позиций для обзора "Все (зоны + поддомены)" с красивым распределением 100–1500 ₽.
 */
function featuredIndexAt(slot: number): number {
  // Чередуем: 1 короткая зона (990-1500₽), 2 тематические зоны (190-790₽), 3 поддомена (100-490₽)
  const cycle = Math.floor(slot / 6);
  const pos = slot % 6;
  if (pos === 0) {
    // Чередуем 2-char и 3-char
    const shortTotal = TWO_CHAR_COUNT + THREE_CHAR_COUNT;
    return (cycle * 73) % shortTotal;
  }
  if (pos === 1 || pos === 2) {
    const start = TWO_CHAR_COUNT + THREE_CHAR_COUNT;
    const span = TOTAL_CATALOG_ZONES - start;
    return start + ((cycle * 2 + (pos - 1)) * 131) % span;
  }
  // Поддомены
  const subPos = cycle * 3 + (pos - 3);
  return TOTAL_CATALOG_ZONES + ((subPos * 397) % TOTAL_CATALOG_SUBDOMAINS);
}

export type CatalogQueryInput = {
  q?: string;
  kind?: 'all' | 'zone' | 'subdomain';
  category?: CatalogCategoryId;
  minPrice?: number;
  maxPrice?: number;
  sort?: CatalogSort;
  page?: number;
  limit?: number;
};

export type CatalogQueryResult = {
  items: MillionCatalogItem[];
  totalMatched: number;
  totalCatalogItems: number;
  totalZones: number;
  totalSubdomains: number;
  page: number;
  limit: number;
  totalPages: number;
};

function buildExactSuggestions(rawQuery: string, kind: 'all' | 'zone' | 'subdomain'): MillionCatalogItem[] {
  const clean = rawQuery.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!clean) return [];
  const results: MillionCatalogItem[] = [];
  const seen = new Set<string>();
  const push = (item: MillionCatalogItem | null) => {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    results.push(item);
  };

  if (clean.includes('.') && !clean.startsWith('.')) {
    const parts = clean.split('.').filter(Boolean);
    if (parts.length >= 2) {
      const sub = parts[0]!;
      const zone = parts[parts.length - 1]!;
      if (kind !== 'zone') push(buildItem(`.${zone}`, sub, undefined, true));
      if (kind !== 'subdomain') push(buildItem(`.${zone}`, '', undefined, true));
    }
  } else {
    const label = clean.replace(/^\.+/, '');
    if (kind !== 'subdomain') {
      push(buildItem(`.${label}`, '', undefined, true));
    }
    if (kind !== 'zone') {
      for (const prefix of ['app', 'shop', 'blog', 'vip']) {
        push(buildItem(`.${label}`, prefix, undefined, false));
      }
    }
  }
  return results;
}

export function queryMillionCatalog(input: CatalogQueryInput = {}): CatalogQueryResult {
  const q = (input.q ?? '').trim().toLowerCase();
  const kind = input.kind ?? 'all';
  const category = input.category ?? 'all';
  const minPrice = Math.max(CATALOG_MIN_PRICE_RUB, Math.min(CATALOG_MAX_PRICE_RUB, input.minPrice ?? CATALOG_MIN_PRICE_RUB));
  const maxPrice = Math.max(minPrice, Math.min(CATALOG_MAX_PRICE_RUB, input.maxPrice ?? CATALOG_MAX_PRICE_RUB));
  const sort = input.sort ?? 'featured';
  const limit = Math.max(1, Math.min(48, input.limit ?? 24));
  const page = Math.max(1, input.page ?? 1);

  const hasFilters =
    Boolean(q) ||
    category !== 'all' ||
    minPrice > CATALOG_MIN_PRICE_RUB ||
    maxPrice < CATALOG_MAX_PRICE_RUB ||
    sort !== 'featured';

  // Быстрый прямой путь без сканирования: поддерживает все 5 126 072 лотов с O(1) пагинацией
  if (!hasFilters) {
    const poolTotal =
      kind === 'zone'
        ? TOTAL_CATALOG_ZONES
        : kind === 'subdomain'
          ? TOTAL_CATALOG_SUBDOMAINS
          : TOTAL_CATALOG_ITEMS;
    const totalPages = Math.max(1, Math.ceil(poolTotal / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const items: MillionCatalogItem[] = [];

    for (let offset = 0; items.length < limit && start + offset < poolTotal; offset++) {
      const slot = start + offset;
      const globalIdx =
        kind === 'zone'
          ? (TWO_CHAR_COUNT + THREE_CHAR_COUNT + ((slot * 131) % Math.max(1, TOTAL_CATALOG_ZONES - TWO_CHAR_COUNT - THREE_CHAR_COUNT)))
          : kind === 'subdomain'
            ? TOTAL_CATALOG_ZONES + ((slot * 397) % TOTAL_CATALOG_SUBDOMAINS)
            : featuredIndexAt(slot);
      const item = itemAtGlobalIndex(globalIdx);
      if (item) items.push(item);
    }

    return {
      items,
      totalMatched: poolTotal,
      totalCatalogItems: TOTAL_CATALOG_ITEMS,
      totalZones: TOTAL_CATALOG_ZONES,
      totalSubdomains: TOTAL_CATALOG_SUBDOMAINS,
      page: safePage,
      limit,
      totalPages,
    };
  }

  // При фильтрации / поиске формируем релевантный детерминированный срез быстро (<15 мс)
  const exactItems = q && page === 1
    ? buildExactSuggestions(q, kind).filter(
        (it) => it.priceRub >= minPrice && it.priceRub <= maxPrice,
      )
    : [];

  const seenIds = new Set(exactItems.map((i) => i.id));
  const matched: MillionCatalogItem[] = [];
  const needCount = page * limit;
  // Максимальный бюджет сканирования кандидатов, чтобы API всегда отвечал мгновенно
  const maxScan = q ? 80_000 : 12_000;

  // Определяем целевую стартовую зону сканирования под сортировку и цену
  const preferShort = category === 'short' || sort === 'short' || (sort === 'price_desc' && minPrice >= 700);
  const preferCheap = sort === 'price_asc' || maxPrice <= 290;

  for (let step = 0; step < maxScan && matched.length < needCount + 120; step++) {
    let globalIdx: number;
    if (preferShort && kind !== 'subdomain') {
      globalIdx = step < TWO_CHAR_COUNT + THREE_CHAR_COUNT
        ? step
        : featuredIndexAt(step);
    } else if (preferCheap && kind === 'zone') {
      const twoWordStart = TWO_CHAR_COUNT + THREE_CHAR_COUNT + WORD_SUFFIX_COUNT;
      globalIdx = twoWordStart + ((step * 197) % Math.max(1, TOTAL_CATALOG_ZONES - twoWordStart));
    } else if (preferCheap && kind !== 'zone') {
      globalIdx = TOTAL_CATALOG_ZONES + ((step * 173) % TOTAL_CATALOG_SUBDOMAINS);
    } else if (kind === 'zone') {
      if (category !== 'all' && category !== 'short') {
        const start = TWO_CHAR_COUNT + THREE_CHAR_COUNT;
        globalIdx = start + ((step * 59) % (TOTAL_CATALOG_ZONES - start));
      } else {
        globalIdx = (step * 79) % TOTAL_CATALOG_ZONES;
      }
    } else if (kind === 'subdomain') {
      globalIdx = TOTAL_CATALOG_ZONES + ((step * 53) % TOTAL_CATALOG_SUBDOMAINS);
    } else {
      globalIdx = featuredIndexAt(step);
    }

    const item = itemAtGlobalIndex(globalIdx);
    if (!item || seenIds.has(item.id)) continue;
    if (kind !== 'all' && item.kind !== kind) continue;
    if (category !== 'all' && item.category !== category) continue;
    if (item.priceRub < minPrice || item.priceRub > maxPrice) continue;

    if (q) {
      const qClean = q.replace(/^\.+/, '');
      if (!item.displayName.includes(qClean) && !item.tld.includes(qClean)) continue;
    }

    seenIds.add(item.id);
    matched.push(item);
  }

  if (sort === 'price_asc') {
    matched.sort((a, b) => a.priceRub - b.priceRub || a.displayName.length - b.displayName.length);
  } else if (sort === 'price_desc') {
    matched.sort((a, b) => b.priceRub - a.priceRub || a.displayName.length - b.displayName.length);
  } else if (sort === 'short') {
    matched.sort((a, b) => a.displayName.length - b.displayName.length || b.priceRub - a.priceRub);
  }

  const combined = [...exactItems, ...matched];
  // Оценка общего количества в отфильтрованной выборке
  const estimatedTotal = q
    ? combined.length
    : Math.max(
        combined.length,
        Math.round(
          (kind === 'zone'
            ? TOTAL_CATALOG_ZONES
            : kind === 'subdomain'
              ? TOTAL_CATALOG_SUBDOMAINS
              : TOTAL_CATALOG_ITEMS) *
            (category === 'all' ? 1 : category === 'short' ? 0.015 : 0.14) *
            Math.max(0.08, (maxPrice - minPrice + 100) / (CATALOG_MAX_PRICE_RUB - CATALOG_MIN_PRICE_RUB + 100)),
        ),
      );

  const start = (page - 1) * limit;
  const pageItems = combined.slice(start, start + limit);
  const totalPages = Math.max(1, Math.ceil(combined.length / limit));

  return {
    items: pageItems,
    totalMatched: estimatedTotal,
    totalCatalogItems: TOTAL_CATALOG_ITEMS,
    totalZones: TOTAL_CATALOG_ZONES,
    totalSubdomains: TOTAL_CATALOG_SUBDOMAINS,
    page: Math.min(page, totalPages),
    limit,
    totalPages,
  };
}
