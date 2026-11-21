'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Coins,
  CreditCard,
  ExternalLink,
  FlaskConical,
  Globe,
  RefreshCw,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PaymentOrderDto, PaymentProvider, StoreListingDto } from '@justtld/shared';
import {
  confirmStoreOrder,
  createStoreOrder,
  getSession,
  getStoreCatalog,
  getStoreOrder,
  signInWithWallet,
  type SessionResponse,
  type StoreCatalogResponse,
} from '@/lib/api';
import { useWallet } from '@/lib/wallet';
import { EmailAuthCard } from '@/components/auth/email-auth-card';
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
  Label,
  Skeleton,
} from '@/components/ui/primitives';

export default function StorePage() {
  const wallet = useWallet();
  const [catalog, setCatalog] = React.useState<StoreCatalogResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sessionState, setSessionState] = React.useState<SessionResponse | null>(null);

  const [customTld, setCustomTld] = React.useState('');
  const [customYears, setCustomYears] = React.useState(1);

  const [checkoutTarget, setCheckoutTarget] = React.useState<{
    mode: 'listing' | 'custom';
    listing?: StoreListingDto;
    tld?: string;
    periodDays?: number;
  } | null>(null);
  const [provider, setProvider] = React.useState<PaymentProvider>('yoomoney');
  const [creatingOrder, setCreatingOrder] = React.useState(false);

  const [activeOrder, setActiveOrder] = React.useState<{
    order: PaymentOrderDto;
    payUrl: string | null;
    instructions: string;
  } | null>(null);
  const [orderModalOpen, setOrderModalOpen] = React.useState(false);
  const [checkingOrder, setCheckingOrder] = React.useState(false);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [cat, sess] = await Promise.all([getStoreCatalog(), getSession()]);
      setCatalog(cat);
      setSessionState(sess);
      if (!cat.gateways.yoomoneyConfigured && cat.gateways.cryptobotConfigured) {
        setProvider('cryptobot');
      } else if (
        !cat.gateways.yoomoneyConfigured &&
        !cat.gateways.cryptobotConfigured &&
        cat.gateways.sandboxEnabled
      ) {
        setProvider('sandbox');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить магазин');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Возврат пользователя со страницы оплаты (?order=uuid)
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const orderId = new URLSearchParams(window.location.search).get('order');
    if (!orderId) return;
    getStoreOrder(orderId)
      .then((res) => {
        setActiveOrder({
          order: res.order,
          payUrl: res.order.payUrl,
          instructions:
            res.order.status === 'fulfilled' || res.order.status === 'paid'
              ? 'Оплата подтверждена! Домен и стартовый сайт уже активированы.'
              : 'Если вы только что оплатили счёт, нажмите «Проверить оплату» через пару секунд.',
        });
        setOrderModalOpen(true);
      })
      .catch(() => undefined);
  }, []);

  // Авто-проверка статуса заказа каждые 4 сек, пока открыто окно ожидания оплаты
  React.useEffect(() => {
    if (!orderModalOpen || !activeOrder || activeOrder.order.status !== 'pending') return;
    const timer = setInterval(() => {
      getStoreOrder(activeOrder.order.id)
        .then((res) => {
          setActiveOrder((prev) =>
            prev ? { ...prev, order: res.order, payUrl: res.order.payUrl ?? prev.payUrl } : prev,
          );
          if (res.order.status === 'fulfilled' || res.order.status === 'paid') {
            toast.success(`Оплата получена! Зона ${res.order.tld} активирована.`);
            void loadAll();
          }
        })
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [orderModalOpen, activeOrder, loadAll]);

  const isAuthenticated = Boolean(sessionState?.session);

  const startWalletSignIn = async () => {
    if (!wallet.address) {
      toast.error('Сначала подключите кошелёк в шапке сайта');
      return;
    }
    try {
      await signInWithWallet(wallet.address, wallet.signMessage);
      toast.success('Сессия кошелька подтверждена');
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка входа');
    }
  };

  const handleCheckoutSubmit = async () => {
    if (!checkoutTarget) return;
    setCreatingOrder(true);
    try {
      const res = await createStoreOrder({
        kind: checkoutTarget.mode === 'listing' ? 'listing' : 'custom_zone',
        provider,
        currency: provider === 'cryptobot' ? 'USDT' : 'RUB',
        listingId: checkoutTarget.mode === 'listing' ? checkoutTarget.listing?.id : undefined,
        tld:
          checkoutTarget.mode === 'custom'
            ? checkoutTarget.tld
            : checkoutTarget.listing?.tld,
      });
      setActiveOrder(res);
      setCheckoutTarget(null);
      setOrderModalOpen(true);
      toast.success('Счёт на оплату создан — нажмите кнопку оплаты в окне');
      await loadAll();
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
        toast.success(`Оплата получена! Зона ${res.order.tld} активирована.`);
        await loadAll();
      } else {
        toast.info(`Статус заказа: ${res.order.status}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось проверить статус');
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
      toast.success(`Готово! Зона ${res.order.tld} передана вам со стартовым сайтом.`);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка подтверждения');
    } finally {
      setCheckingOrder(false);
    }
  };

  const normalizedCustomTld = customTld.trim().toLowerCase().replace(/^\.+/, '');
  const customRub = catalog ? catalog.pricing.customZonePriceRub : 0;
  const customUsdt = catalog ? Number(catalog.pricing.customZonePriceUsdt.toFixed(2)) : 0;

  return (
    <div className="container space-y-8 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-2 gap-1.5">
            <ShoppingBag className="h-3.5 w-3.5 text-primary" />
            Официальная витрина JustTLD
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">Магазин зон, сайтов и DNS</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Купите доменную зону за рубли (ЮMoney) или криптовалюту (@CryptoBot), загрузите свой
            сайт во встроенный хостинг или настройте реальные DNS-записи.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sessionState?.account ? (
            <Badge variant="success" className="px-3 py-1.5">
              Аккаунт: {sessionState.account.email}
            </Badge>
          ) : sessionState?.session ? (
            <Badge variant="success" className="mono px-3 py-1.5">
              Сессия: {sessionState.session.address.slice(0, 10)}…
            </Badge>
          ) : (
            <Badge variant="warning" className="px-3 py-1.5">
              Войдите для оформления заказа
            </Badge>
          )}
        </div>
      </div>

      {!isAuthenticated && (
        <div className="grid gap-4 lg:grid-cols-2">
          <EmailAuthCard
            title="Быстрый вход или регистрация по Email"
            description="После входа вы сможете сразу оплатить зону в рублях или USDT и управлять сайтом в личном кабинете."
            onSuccess={() => void loadAll()}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Или вход через криптокошелёк</CardTitle>
              <CardDescription>
                Если вы уже пользуетесь MetaMask / WalletConnect в JustTLD, просто подтвердите
                подписью.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Текущий подключённый кошелёк:{' '}
                <span className="mono text-foreground">
                  {wallet.address ?? 'не подключён'}
                </span>
              </p>
              <Button onClick={() => void startWalletSignIn()} disabled={!wallet.address}>
                Подтвердить вход кошельком
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {activeOrder && (
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Заказ для зоны <span className="mono">{activeOrder.order.tld}</span> —{' '}
              {activeOrder.order.amount} {activeOrder.order.currency}
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
                ? 'Оплачено и выдано'
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
                catalog?.gateways.sandboxEnabled && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={checkingOrder}
                    onClick={() => void handleSandboxConfirm(activeOrder.order.id)}
                    className="gap-1.5"
                  >
                    <FlaskConical className="h-3.5 w-3.5" />
                    Тестово подтвердить оплату
                  </Button>
                )}
              {(activeOrder.order.status === 'fulfilled' || activeOrder.order.status === 'paid') && (
                <Button asChild size="sm" className="gap-1.5">
                  <Link href={`/zone/${encodeURIComponent(activeOrder.order.tld)}?tab=site`}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Управлять сайтом и поддоменами
                  </Link>
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Конструктор произвольной зоны */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5 text-primary" />
            Купить новую зону по своему имени
          </CardTitle>
          <CardDescription>
            Введите желаемое имя зоны — мы выдадим права, откроем панель поддоменов, встроенный
            хостинг и DNS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Имя новой зоны</Label>
              <div className="flex items-center gap-1">
                <span className="mono text-lg font-bold text-muted-foreground">.</span>
                <Input
                  value={customTld}
                  onChange={(e) => setCustomTld(e.target.value)}
                  placeholder="myshop"
                  className="mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Срок аренды</Label>
              <select
                value={customYears}
                onChange={(e) => setCustomYears(Number(e.target.value))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value={1}>1 год (365 дней)</option>
                <option value={2}>2 года (730 дней)</option>
                <option value={3}>3 года (1095 дней)</option>
              </select>
            </div>
            <div className="flex flex-col justify-end gap-1">
              <Button
                disabled={!normalizedCustomTld || !isAuthenticated}
                onClick={() =>
                  setCheckoutTarget({
                    mode: 'custom',
                    tld: `.${normalizedCustomTld}`,
                    periodDays: customYears * 365,
                  })
                }
              >
                Купить за {customRub} ₽ / {customUsdt} USDT
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Витрина лотов от админа */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Витрина зон от администратора</h2>
          <Button variant="ghost" size="sm" onClick={() => void loadAll()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Обновить
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : !catalog?.listings.length ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Администратор ещё не добавил готовые лоты на витрину — вы можете купить любую
              свободную зону через форму выше.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {catalog.listings.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="mono text-xl">{item.tld}</CardTitle>
                    <Badge variant="secondary">{item.status}</Badge>
                  </div>
                  <CardDescription>{item.title}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {item.description && (
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  )}
                  <div className="flex items-baseline justify-between rounded-md bg-muted/40 px-3 py-2">
                    <div className="text-sm font-semibold">
                      {item.priceRub} ₽{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        / {item.priceUsdt} USDT
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{item.periodDays} дн.</span>
                  </div>
                  <Button
                    className="w-full"
                    disabled={!isAuthenticated}
                    onClick={() => setCheckoutTarget({ mode: 'listing', listing: item })}
                  >
                    {isAuthenticated ? 'Выбрать способ оплаты' : 'Войдите для покупки'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Мои заказы и купленные зоны */}
      {isAuthenticated && catalog && (catalog.myCustody.length > 0 || catalog.myOrders.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Мои купленные зоны и поддомены</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {catalog.myCustody.length === 0 ? (
                <p className="text-sm text-muted-foreground">У вас пока нет купленных зон.</p>
              ) : (
                catalog.myCustody.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="mono font-semibold">
                        {c.subLabel ? `${c.subLabel}${c.tld}` : c.tld}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        До {new Date(c.expiresAt).toLocaleDateString('ru-RU')}
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/zone/${encodeURIComponent(c.tld)}?tab=site`}>
                        Сайт и DNS
                      </Link>
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">История заказов</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {catalog.myOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Заказов пока нет.</p>
              ) : (
                catalog.myOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="mono font-semibold">{ord.tld}</span> · {ord.amount}{' '}
                      {ord.currency} ({ord.provider})
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          ord.status === 'fulfilled' || ord.status === 'paid'
                            ? 'success'
                            : ord.status === 'pending'
                              ? 'warning'
                              : 'destructive'
                        }
                      >
                        {ord.status === 'fulfilled' ? 'оплачено' : ord.status}
                      </Badge>
                      {ord.status === 'pending' && ord.payUrl && (
                        <Button asChild size="sm" className="h-7 gap-1 px-2.5 text-xs">
                          <a href={ord.payUrl} target="_blank" rel="noreferrer">
                            Оплатить <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                      )}
                      {ord.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs"
                          onClick={() => void refreshOrderStatus(ord.id)}
                        >
                          Проверить
                        </Button>
                      )}
                      {(ord.status === 'fulfilled' || ord.status === 'paid') && (
                        <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-xs">
                          <Link href={`/zone/${encodeURIComponent(ord.tld)}?tab=site`}>
                            Управление
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Модальное окно выбора способа оплаты */}
      <Dialog open={Boolean(checkoutTarget)} onOpenChange={(o) => !o && setCheckoutTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Оплата зоны{' '}
              <span className="mono">
                {checkoutTarget?.mode === 'listing'
                  ? checkoutTarget.listing?.tld
                  : checkoutTarget?.tld}
              </span>
            </DialogTitle>
            <DialogDescription>
              Выберите удобный способ оплаты. После подтверждения платежа зона автоматически
              активируется в вашем кабинете.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                provider === 'yoomoney' ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="provider"
                  checked={provider === 'yoomoney'}
                  onChange={() => setProvider('yoomoney')}
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <CreditCard className="h-4 w-4 text-primary" />
                    ЮMoney (Банковская карта / кошелёк RUB)
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {catalog?.gateways.yoomoneyConfigured
                      ? 'Моментальная автоактивация через Quickpay webhook'
                      : 'Шлюз ЮMoney не настроен в env (ожидает ключи)'}
                  </div>
                </div>
              </div>
              <span className="text-sm font-semibold">
                {checkoutTarget?.mode === 'listing'
                  ? checkoutTarget.listing?.priceRub
                  : customRub}{' '}
                ₽
              </span>
            </label>

            <label
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                provider === 'cryptobot' ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="provider"
                  checked={provider === 'cryptobot'}
                  onChange={() => setProvider('cryptobot')}
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Coins className="h-4 w-4 text-primary" />
                    @CryptoBot (USDT / TON / BTC)
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {catalog?.gateways.cryptobotConfigured
                      ? 'Оплата через Telegram Crypto Pay API'
                      : 'Токен CryptoBot не настроен в env (ожидает ключи)'}
                  </div>
                </div>
              </div>
              <span className="text-sm font-semibold">
                {checkoutTarget?.mode === 'listing'
                  ? checkoutTarget.listing?.priceUsdt
                  : customUsdt}{' '}
                USDT
              </span>
            </label>

            {catalog?.gateways.sandboxEnabled && (
              <label
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                  provider === 'sandbox' ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="provider"
                    checked={provider === 'sandbox'}
                    onChange={() => setProvider('sandbox')}
                  />
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <FlaskConical className="h-4 w-4 text-primary" />
                      Тестовый режим (Sandbox)
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Проверка полного цикла покупки, хостинга и DNS без реального списания
                    </div>
                  </div>
                </div>
                <Badge variant="outline">TEST</Badge>
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCheckoutTarget(null)}>
              Отмена
            </Button>
            <Button disabled={creatingOrder} onClick={() => void handleCheckoutSubmit()}>
              {creatingOrder ? 'Создание счёта…' : 'Создать счёт на оплату'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Окно выставленного счёта с прямой кнопкой оплаты */}
      <Dialog open={orderModalOpen && Boolean(activeOrder)} onOpenChange={setOrderModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between gap-2 pr-6">
              <span>
                Счёт для <span className="mono">{activeOrder?.order.tld}</span>
              </span>
              {activeOrder && (
                <Badge
                  variant={
                    activeOrder.order.status === 'fulfilled' || activeOrder.order.status === 'paid'
                      ? 'success'
                      : activeOrder.order.status === 'pending'
                        ? 'warning'
                        : 'destructive'
                  }
                >
                  {activeOrder.order.status === 'fulfilled'
                    ? 'Оплачено и выдано'
                    : activeOrder.order.status === 'pending'
                      ? 'Ожидает оплаты'
                      : activeOrder.order.status}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              К оплате:{' '}
              <strong className="text-foreground">
                {activeOrder?.order.amount} {activeOrder?.order.currency}
              </strong>{' '}
              ({activeOrder?.order.provider === 'yoomoney' ? 'ЮMoney' : activeOrder?.order.provider === 'cryptobot' ? '@CryptoBot' : 'Sandbox'})
            </DialogDescription>
          </DialogHeader>

          {activeOrder && (
            <div className="space-y-4 py-2">
              {activeOrder.instructions && (
                <p className="text-sm text-muted-foreground">{activeOrder.instructions}</p>
              )}

              {activeOrder.order.status === 'pending' && activeOrder.payUrl && (
                <Button asChild size="lg" className="w-full gap-2 text-base">
                  <a href={activeOrder.payUrl} target="_blank" rel="noreferrer">
                    {activeOrder.order.provider === 'yoomoney'
                      ? `Оплатить ${activeOrder.order.amount} ₽ в ЮMoney`
                      : `Оплатить ${activeOrder.order.amount} ${activeOrder.order.currency} в @CryptoBot`}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}

              {activeOrder.order.status === 'pending' && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5"
                    disabled={checkingOrder}
                    onClick={() => void refreshOrderStatus(activeOrder.order.id)}
                  >
                    <RefreshCw className={`h-4 w-4 ${checkingOrder ? 'animate-spin' : ''}`} />
                    Я оплатил — проверить статус
                  </Button>
                </div>
              )}

              {(activeOrder.order.status === 'fulfilled' || activeOrder.order.status === 'paid') && (
                <Button asChild size="lg" className="w-full gap-2">
                  <Link href={`/zone/${encodeURIComponent(activeOrder.order.tld)}?tab=site`}>
                    <CheckCircle2 className="h-4 w-4" />
                    Открыть управление зоной и сайтом
                  </Link>
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
