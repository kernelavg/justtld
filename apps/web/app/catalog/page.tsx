'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Coins,
  CreditCard,
  Dice5,
  ExternalLink,
  FlaskConical,
  Globe,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CATALOG_CATEGORIES,
  CATALOG_MAX_PRICE_RUB,
  CATALOG_MIN_PRICE_RUB,
  type PaymentOrderDto,
  type PaymentProvider,
} from '@justtld/shared';
import {
  confirmStoreOrder,
  createStoreOrder,
  getMillionCatalog,
  getSession,
  getStoreOrder,
  type MillionCatalogItemDto,
  type MillionCatalogResponse,
  type SessionResponse,
} from '@/lib/api';
import { EmailAuthCard } from '@/components/auth/email-auth-card';
import { AdBanner } from '@/components/ads/ad-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@/components/ui/primitives';

const CATEGORY_LABELS = Object.fromEntries(
  CATALOG_CATEGORIES.map((c) => [c.id, c.labelRu]),
) as Record<string, string>;

const PRICE_PRESETS: Array<{ label: string; min: number; max: number }> = [
  { label: 'Все (100–1500 ₽)', min: 100, max: 1500 },
  { label: '100–250 ₽', min: 100, max: 250 },
  { label: '250–690 ₽', min: 250, max: 690 },
  { label: '700–1500 ₽', min: 700, max: 1500 },
];

export default function CatalogPage() {
  const [data, setData] = React.useState<MillionCatalogResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sessionState, setSessionState] = React.useState<SessionResponse | null>(null);

  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [kind, setKind] = React.useState<'all' | 'zone' | 'subdomain'>('all');
  const [category, setCategory] = React.useState('all');
  const [minPrice, setMinPrice] = React.useState(CATALOG_MIN_PRICE_RUB);
  const [maxPrice, setMaxPrice] = React.useState(CATALOG_MAX_PRICE_RUB);
  const [sort, setSort] = React.useState<'featured' | 'price_asc' | 'price_desc' | 'short'>('featured');
  const [onlyAvailable, setOnlyAvailable] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [jumpPage, setJumpPage] = React.useState('');

  const [selectedItem, setSelectedItem] = React.useState<MillionCatalogItemDto | null>(null);
  const [provider, setProvider] = React.useState<PaymentProvider>('yoomoney');
  const [creatingOrder, setCreatingOrder] = React.useState(false);

  const [activeOrder, setActiveOrder] = React.useState<{
    order: PaymentOrderDto;
    payUrl: string | null;
    instructions: string;
  } | null>(null);
  const [checkingOrder, setCheckingOrder] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadSession = React.useCallback(async () => {
    try {
      const sess = await getSession();
      setSessionState(sess);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const loadCatalog = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMillionCatalog({
        q: debouncedQuery || undefined,
        kind,
        category,
        minPrice,
        maxPrice,
        sort,
        page,
        limit: 24,
        onlyAvailable,
      });
      setData(res);
      if (!res.gateways.yoomoneyConfigured && res.gateways.cryptobotConfigured) {
        setProvider('cryptobot');
      } else if (
        !res.gateways.yoomoneyConfigured &&
        !res.gateways.cryptobotConfigured &&
        res.gateways.sandboxEnabled
      ) {
        setProvider('sandbox');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить каталог');
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, kind, category, minPrice, maxPrice, sort, page, onlyAvailable]);

  React.useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  React.useEffect(() => {
    if (!activeOrder || activeOrder.order.status !== 'pending') return;
    const timer = setInterval(() => {
      getStoreOrder(activeOrder.order.id)
        .then((res) => {
          setActiveOrder((prev) =>
            prev ? { ...prev, order: res.order, payUrl: res.order.payUrl ?? prev.payUrl } : prev,
          );
          if (res.order.status === 'fulfilled' || res.order.status === 'paid') {
            toast.success(`Оплата подтверждена! Домен активирован.`);
            void loadCatalog();
          }
        })
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [activeOrder, loadCatalog]);

  const isAuthenticated = Boolean(sessionState?.session);
  const isAdmin = sessionState?.session?.role === 'admin';

  const handleCheckout = async () => {
    if (!selectedItem) return;
    setCreatingOrder(true);
    try {
      const res = await createStoreOrder({
        kind: selectedItem.kind === 'zone' ? 'custom_zone' : 'custom_subdomain',
        tld: selectedItem.tld,
        subLabel: selectedItem.subLabel,
        catalogPrice: true,
        provider,
        currency: provider === 'cryptobot' ? 'USDT' : 'RUB',
      });
      setActiveOrder(res);
      setSelectedItem(null);
      toast.success('Счёт на оплату создан!');
      await loadCatalog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось создать заказ');
    } finally {
      setCreatingOrder(false);
    }
  };

  const refreshOrderStatus = async (orderId: string) => {
    setCheckingOrder(true);
    try {
      const res = await getStoreOrder(orderId);
      setActiveOrder((prev) =>
        prev
          ? { ...prev, order: res.order }
          : { order: res.order, payUrl: res.order.payUrl, instructions: '' },
      );
      if (res.order.status === 'fulfilled' || res.order.status === 'paid') {
        toast.success('Оплата подтверждена! Сайт и DNS активированы.');
        await loadCatalog();
      } else {
        toast.info(`Статус заказа: ${res.order.status}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка проверки');
    } finally {
      setCheckingOrder(false);
    }
  };

  const handleSandboxConfirm = async (orderId: string) => {
    setCheckingOrder(true);
    try {
      const res = await confirmStoreOrder(orderId);
      setActiveOrder((prev) =>
        prev ? { ...prev, order: res.order } : { order: res.order, payUrl: null, instructions: '' },
      );
      toast.success('Готово! Домен выдан со стартовым сайтом.');
      await loadCatalog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка подтверждения');
    } finally {
      setCheckingOrder(false);
    }
  };

  const totalItemsFmt = (data?.totalCatalogItems ?? 5126072).toLocaleString('ru-RU');
  const totalZonesFmt = (data?.totalZones ?? 1286072).toLocaleString('ru-RU');
  const totalSubsFmt = (data?.totalSubdomains ?? 3840000).toLocaleString('ru-RU');
  const totalPages = data?.totalPages ?? 1;

  const jumpToPage = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(jumpPage);
    if (!Number.isFinite(num) || num < 1) return;
    setPage(Math.min(totalPages, Math.trunc(num)));
    setJumpPage('');
  };

  const jumpRandom = () => {
    const maxP = Math.max(1, totalPages);
    const rnd = Math.max(1, Math.floor(Math.random() * maxP) + 1);
    setPage(rnd);
  };

  return (
    <div className="container max-w-7xl space-y-7 py-8 sm:py-10">
      {/* Hero-баннер публичного каталога */}
      <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/10 via-card/80 to-background p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Публичный маркетплейс JustTLD · Root DNS + ICANN-шлюз
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">
              {totalItemsFmt}+ зон и поддоменов
              <span className="block text-lg font-normal text-muted-foreground sm:text-xl">
                по ценам от 100 ₽ до 1 500 ₽ за год с мгновенным запуском сайта
              </span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Выбирайте готовые домены 1-го (<span className="mono text-foreground">http://myzone</span>) и
              2-го уровня (<span className="mono text-foreground">http://shop.myzone</span>) или введите
              собственное имя — цена рассчитывается прозрачно от 100 до 1500 ₽.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:w-auto">
            <div className="rounded-2xl border border-border/60 bg-background/70 px-3.5 py-2.5">
              <div className="text-[11px] text-muted-foreground">Всего в каталоге</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums">{totalItemsFmt}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 px-3.5 py-2.5">
              <div className="text-[11px] text-muted-foreground">Зон 1-го ур.</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums">{totalZonesFmt}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 px-3.5 py-2.5">
              <div className="text-[11px] text-muted-foreground">Поддоменов 2 ур.</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums">{totalSubsFmt}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 px-3.5 py-2.5">
              <div className="text-[11px] text-muted-foreground">Диапазон цен</div>
              <div className="mt-0.5 text-base font-semibold text-primary">100–1 500 ₽</div>
            </div>
          </div>
        </div>
      </div>

      <AdBanner placement="store_top" isAuthenticated={isAuthenticated} isAdmin={isAdmin} />

      {activeOrder && (
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Заказ для{' '}
              <span className="mono">
                {activeOrder.order.subLabel
                  ? `${activeOrder.order.subLabel}${activeOrder.order.tld}`
                  : activeOrder.order.tld}
              </span>{' '}
              — {activeOrder.order.amount} {activeOrder.order.currency}
            </span>
            <Badge
              variant={
                activeOrder.order.status === 'fulfilled' || activeOrder.order.status === 'paid'
                  ? 'success'
                  : activeOrder.order.status === 'pending'
                    ? 'warning'
                    : 'destructive'
              }
            >
              {activeOrder.order.status === 'fulfilled' || activeOrder.order.status === 'paid'
                ? 'Оплачено и активировано'
                : activeOrder.order.status === 'pending'
                  ? 'Ожидает оплаты'
                  : activeOrder.order.status}
            </Badge>
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            {activeOrder.instructions && <p>{activeOrder.instructions}</p>}
            <div className="flex flex-wrap gap-2">
              {activeOrder.order.status === 'pending' && activeOrder.payUrl && (
                <Button asChild size="sm" className="gap-1.5">
                  <a href={activeOrder.payUrl} target="_blank" rel="noreferrer">
                    Перейти к оплате <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
              {activeOrder.order.status === 'pending' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={checkingOrder}
                  onClick={() => void refreshOrderStatus(activeOrder.order.id)}
                  className="gap-1.5"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${checkingOrder ? 'animate-spin' : ''}`} />
                  Проверить оплату
                </Button>
              )}
              {activeOrder.order.status === 'pending' &&
                activeOrder.order.provider === 'sandbox' &&
                data?.gateways.sandboxEnabled && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={checkingOrder}
                    onClick={() => void handleSandboxConfirm(activeOrder.order.id)}
                    className="gap-1.5"
                  >
                    <FlaskConical className="h-3.5 w-3.5" />
                    Тестово подтвердить
                  </Button>
                )}
              {(activeOrder.order.status === 'fulfilled' || activeOrder.order.status === 'paid') && (
                <Button asChild size="sm" className="gap-1.5">
                  <Link href={`/zone/${encodeURIComponent(activeOrder.order.tld)}?tab=site`}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Открыть сайт и DNS
                  </Link>
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Панель поиска и фильтров */}
      <Card className="border-border/70 bg-card/70">
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-3 md:grid-cols-12">
            <div className="relative md:col-span-5">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Поиск по 5+ млн: например femboy, shop.nova, ai, x7..."
                className="mono h-10 pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 md:col-span-4">
              {(
                [
                  { id: 'all', label: 'Все уровни' },
                  { id: 'zone', label: '1 уровень (.tld)' },
                  { id: 'subdomain', label: '2 уровень (sub.tld)' },
                ] as const
              ).map((opt) => (
                <Button
                  key={opt.id}
                  type="button"
                  size="sm"
                  variant={kind === opt.id ? 'default' : 'outline'}
                  className="h-10 rounded-xl px-3 text-xs"
                  onClick={() => {
                    setKind(opt.id);
                    setPage(1);
                  }}
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            <div className="md:col-span-3">
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as typeof sort);
                  setPage(1);
                }}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="featured">Сортировка: Рекомендуемые</option>
                <option value="price_asc">Сначала дешёвые (от 100 ₽)</option>
                <option value="price_desc">Сначала дорогие (до 1500 ₽)</option>
                <option value="short">Самые короткие имена</option>
              </select>
            </div>
          </div>

          {/* Ценовые фильтры */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/50 pt-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Цена:
              </span>
              {PRICE_PRESETS.map((preset) => {
                const active = minPrice === preset.min && maxPrice === preset.max;
                return (
                  <Button
                    key={preset.label}
                    type="button"
                    size="sm"
                    variant={active ? 'secondary' : 'ghost'}
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => {
                      setMinPrice(preset.min);
                      setMaxPrice(preset.max);
                      setPage(1);
                    }}
                  >
                    {preset.label}
                  </Button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 text-muted-foreground">
                <span>От</span>
                <Input
                  type="number"
                  min={100}
                  max={maxPrice}
                  step={10}
                  value={minPrice}
                  onChange={(e) => {
                    const v = Math.max(100, Math.min(maxPrice, Number(e.target.value) || 100));
                    setMinPrice(v);
                    setPage(1);
                  }}
                  className="h-7 w-20 px-2 text-xs tabular-nums"
                />
                <span>₽</span>
              </label>
              <label className="flex items-center gap-1.5 text-muted-foreground">
                <span>До</span>
                <Input
                  type="number"
                  min={minPrice}
                  max={1500}
                  step={10}
                  value={maxPrice}
                  onChange={(e) => {
                    const v = Math.min(1500, Math.max(minPrice, Number(e.target.value) || 1500));
                    setMaxPrice(v);
                    setPage(1);
                  }}
                  className="h-7 w-20 px-2 text-xs tabular-nums"
                />
                <span>₽</span>
              </label>

              <label className="flex cursor-pointer items-center gap-1.5 select-none">
                <input
                  type="checkbox"
                  checked={onlyAvailable}
                  onChange={(e) => {
                    setOnlyAvailable(e.target.checked);
                    setPage(1);
                  }}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                <span>Только свободные</span>
              </label>
            </div>
          </div>

          {/* Категории */}
          <div className="flex flex-wrap gap-1.5 border-t border-border/50 pt-3">
            {CATALOG_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setCategory(cat.id);
                  setPage(1);
                }}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  category === cat.id
                    ? 'border-primary/50 bg-primary/15 font-medium text-foreground'
                    : 'border-border/60 bg-background/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat.labelRu}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Статус выдачи */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div>
          Найдено в каталоге:{' '}
          <strong className="text-foreground tabular-nums">
            {(data?.totalMatched ?? 0).toLocaleString('ru-RU')}
          </strong>{' '}
          позиций · страница{' '}
          <strong className="text-foreground tabular-nums">{page.toLocaleString('ru-RU')}</strong> из{' '}
          <strong className="text-foreground tabular-nums">
            {totalPages.toLocaleString('ru-RU')}
          </strong>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 rounded-full text-xs"
            onClick={jumpRandom}
          >
            <Dice5 className="h-3.5 w-3.5" />
            Случайная страница
          </Button>
          <Button asChild size="sm" variant="ghost" className="h-7 rounded-full text-xs">
            <Link href="/store">Витрина P2P и админ-лоты →</Link>
          </Button>
        </div>
      </div>

      {/* Сетка лотов */}
      {loading ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.items.map((item) => (
            <Card
              key={item.id}
              className={`flex flex-col justify-between transition-colors ${
                item.isExactMatch
                  ? 'border-primary/60 bg-primary/[0.04]'
                  : 'border-border/70 hover:border-border'
              }`}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <Badge variant={item.kind === 'zone' ? 'default' : 'outline'} className="text-[10px]">
                    {item.kind === 'zone' ? (
                      <span className="inline-flex items-center gap-1">
                        <Globe className="h-2.5 w-2.5" /> 1 уровень
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Layers className="h-2.5 w-2.5" /> 2 уровень
                      </span>
                    )}
                  </Badge>
                  <div className="flex items-center gap-1">
                    {item.isExactMatch && (
                      <Badge variant="success" className="text-[10px]">
                        Ваш запрос
                      </Badge>
                    )}
                    <Badge
                      variant={item.available ? 'success' : 'secondary'}
                      className="text-[10px]"
                    >
                      {item.available ? 'Свободно' : 'Занято'}
                    </Badge>
                  </div>
                </div>

                <div>
                  <CardTitle className="mono truncate text-lg" title={item.displayName}>
                    {item.displayName}
                  </CardTitle>
                  <CardDescription className="mt-1 flex items-center justify-between text-[11px]">
                    <span>{CATEGORY_LABELS[item.category] ?? item.category}</span>
                    <span>365 дн.</span>
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pt-0">
                <div className="space-y-1 rounded-xl border border-border/50 bg-background/60 px-2.5 py-2 text-[11px] text-muted-foreground">
                  <div className="mono truncate text-foreground/90">{item.rootUrl}</div>
                  <div className="mono truncate opacity-75">{item.gatewayHost}</div>
                </div>

                <div className="flex items-end justify-between gap-2">
                  <div>
                    <div className="text-xl font-semibold tracking-tight tabular-nums">
                      {item.priceRub} ₽
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      ≈ {item.priceUsdt} USDT
                    </div>
                  </div>
                  {item.available ? (
                    <Button
                      size="sm"
                      className="gap-1.5 rounded-full"
                      onClick={() => setSelectedItem(item)}
                    >
                      <ShoppingBag className="h-3.5 w-3.5" />
                      Купить
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline" className="rounded-full">
                      <Link href={`/zone/${encodeURIComponent(item.tld)}`}>Открыть</Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-10 text-center">
          <div className="mx-auto max-w-md space-y-2">
            <Tag className="mx-auto h-7 w-7 text-muted-foreground" />
            <h3 className="text-base font-medium">По заданным фильтрам ничего не найдено</h3>
            <p className="text-xs text-muted-foreground">
              Попробуйте расширить диапазон цен (100–1500 ₽), сбросить категорию или ввести имя на
              латинице (a-z, 0-9, дефис).
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSearchInput('');
                setKind('all');
                setCategory('all');
                setMinPrice(100);
                setMaxPrice(1500);
                setOnlyAvailable(false);
                setPage(1);
              }}
            >
              Сбросить фильтры
            </Button>
          </div>
        </Card>
      )}

      {/* Пагинация на миллионы страниц */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/50 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(1)}
            >
              В начало
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Назад
            </Button>
            <span className="px-2 text-xs text-muted-foreground tabular-nums">
              Стр. <strong className="text-foreground">{page.toLocaleString('ru-RU')}</strong> /{' '}
              {totalPages.toLocaleString('ru-RU')}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Вперёд
            </Button>
          </div>

          <form onSubmit={jumpToPage} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Перейти на стр.:</span>
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              placeholder="напр. 10500"
              className="h-8 w-28 text-xs tabular-nums"
            />
            <Button type="submit" size="sm" variant="secondary">
              Открыть
            </Button>
          </form>
        </div>
      )}

      {/* Модальное окно оформления заказа */}
      <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              Оформление: <span className="mono">{selectedItem?.displayName}</span>
            </DialogTitle>
            <DialogDescription>
              Срок регистрации — 1 год (365 дней). Включает встроенный хостинг сайта, SSL, Root DNS и
              шлюз.
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {selectedItem.kind === 'zone' ? 'Доменная зона (1 ур.)' : 'Поддомен (2 ур.)'}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">
                    {selectedItem.priceRub} ₽
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="mono">{selectedItem.rootUrl}</span>
                  <span>≈ {selectedItem.priceUsdt} USDT</span>
                </div>
              </div>

              {!isAuthenticated ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Войдите через Google или Email за 5 секунд, чтобы домен сразу привязался к вашему
                    кабинету:
                  </p>
                  <EmailAuthCard
                    title="Вход для покупки"
                    description="После входа можно сразу оплатить заказ."
                    googleAuthEnabled={sessionState?.googleAuthEnabled}
                    onSuccess={() => void loadSession()}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Выберите способ оплаты:</div>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      disabled={!data?.gateways.yoomoneyConfigured}
                      onClick={() => setProvider('yoomoney')}
                      className={`flex items-center justify-between rounded-xl border p-3 text-left text-xs transition-colors ${
                        provider === 'yoomoney'
                          ? 'border-primary bg-primary/10'
                          : 'border-border/70 hover:bg-muted/40'
                      } disabled:opacity-45`}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <CreditCard className="h-4 w-4 text-primary" />
                        ЮMoney (карта РФ / СБП / кошелёк)
                      </span>
                      <span className="font-semibold tabular-nums">{selectedItem.priceRub} ₽</span>
                    </button>

                    <button
                      type="button"
                      disabled={!data?.gateways.cryptobotConfigured}
                      onClick={() => setProvider('cryptobot')}
                      className={`flex items-center justify-between rounded-xl border p-3 text-left text-xs transition-colors ${
                        provider === 'cryptobot'
                          ? 'border-primary bg-primary/10'
                          : 'border-border/70 hover:bg-muted/40'
                      } disabled:opacity-45`}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <Coins className="h-4 w-4 text-primary" />
                        Telegram @CryptoBot (USDT / TON)
                      </span>
                      <span className="font-semibold tabular-nums">{selectedItem.priceUsdt} USDT</span>
                    </button>

                    {data?.gateways.sandboxEnabled && (
                      <button
                        type="button"
                        onClick={() => setProvider('sandbox')}
                        className={`flex items-center justify-between rounded-xl border p-3 text-left text-xs transition-colors ${
                          provider === 'sandbox'
                            ? 'border-primary bg-primary/10'
                            : 'border-border/70 hover:bg-muted/40'
                        }`}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <FlaskConical className="h-4 w-4 text-primary" />
                          Тестовая оплата (Sandbox)
                        </span>
                        <span className="font-semibold">{selectedItem.priceRub} ₽</span>
                      </button>
                    )}
                  </div>

                  <Button
                    className="w-full gap-2"
                    disabled={creatingOrder}
                    onClick={() => void handleCheckout()}
                  >
                    {creatingOrder ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShoppingBag className="h-4 w-4" />
                    )}
                    Создать счёт на {provider === 'cryptobot' ? `${selectedItem.priceUsdt} USDT` : `${selectedItem.priceRub} ₽`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
