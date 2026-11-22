import { getOccupiedAssetsSet } from '@justtld/db';
import {
  CATALOG_CATEGORIES,
  CATALOG_MAX_PRICE_RUB,
  CATALOG_MIN_PRICE_RUB,
  queryMillionCatalog,
  type CatalogCategoryId,
  type CatalogSort,
} from '@justtld/shared';
import { jsonResponse, route } from '@/lib/server/http';
import { paymentGatewaysStatus } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

const VALID_KINDS = new Set(['all', 'zone', 'subdomain']);
const VALID_CATEGORIES = new Set(CATALOG_CATEGORIES.map((c) => c.id));
const VALID_SORTS = new Set(['featured', 'price_asc', 'price_desc', 'short']);

export const GET = route(
  async (request) => {
    const sp = new URL(request.url).searchParams;
    const q = (sp.get('q') ?? '').trim().slice(0, 64);
    const rawKind = sp.get('kind') ?? 'all';
    const kind = (VALID_KINDS.has(rawKind) ? rawKind : 'all') as 'all' | 'zone' | 'subdomain';
    const rawCat = sp.get('category') ?? 'all';
    const category = (VALID_CATEGORIES.has(rawCat as CatalogCategoryId)
      ? rawCat
      : 'all') as CatalogCategoryId;
    const rawSort = sp.get('sort') ?? 'featured';
    const sort = (VALID_SORTS.has(rawSort) ? rawSort : 'featured') as CatalogSort;

    const minPriceRaw = Number(sp.get('minPrice') ?? CATALOG_MIN_PRICE_RUB);
    const maxPriceRaw = Number(sp.get('maxPrice') ?? CATALOG_MAX_PRICE_RUB);
    const minPrice = Number.isFinite(minPriceRaw) ? minPriceRaw : CATALOG_MIN_PRICE_RUB;
    const maxPrice = Number.isFinite(maxPriceRaw) ? maxPriceRaw : CATALOG_MAX_PRICE_RUB;

    const pageRaw = Number(sp.get('page') ?? 1);
    const limitRaw = Number(sp.get('limit') ?? 24);
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(48, Math.trunc(limitRaw))) : 24;
    const onlyAvailable = sp.get('onlyAvailable') === '1';

    const result = queryMillionCatalog({
      q,
      kind,
      category,
      minPrice,
      maxPrice,
      sort,
      page,
      limit,
    });

    let occupied = new Set<string>();
    try {
      occupied = await getOccupiedAssetsSet(
        result.items.map((item) => ({ tld: item.tld, subLabel: item.subLabel })),
      );
    } catch {
      occupied = new Set<string>();
    }

    const enriched = result.items
      .map((item) => {
        const selfOccupied = occupied.has(`${item.tld}|${item.subLabel}`);
        const parentOccupied = item.kind === 'subdomain' && occupied.has(`${item.tld}|`);
        const available = !selfOccupied && !parentOccupied;
        return {
          ...item,
          available,
        };
      })
      .filter((item) => (onlyAvailable ? item.available : true));

    const gw = paymentGatewaysStatus();

    return jsonResponse({
      items: enriched,
      totalMatched: result.totalMatched,
      totalCatalogItems: result.totalCatalogItems,
      totalZones: result.totalZones,
      totalSubdomains: result.totalSubdomains,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      priceRange: {
        minRub: CATALOG_MIN_PRICE_RUB,
        maxRub: CATALOG_MAX_PRICE_RUB,
      },
      categories: CATALOG_CATEGORIES,
      gateways: {
        yoomoneyConfigured: gw.yoomoneyConfigured,
        cryptobotConfigured: gw.cryptoBotConfigured,
        sandboxEnabled: gw.sandboxEnabled,
      },
    });
  },
  { limit: 'read', bucket: 'million-catalog' },
);
