'use client';

import * as React from 'react';
import {
  CheckCircle2,
  Gift,
  Megaphone,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShoppingBag,
  Trash2,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  AdPlacement,
  AdSlotDto,
  PaymentOrderDto,
  SellerEarningDto,
  StoreListingDto,
  StorePricingDto,
  ZoneCustodyDto,
} from '@justtld/shared';
import {
  adminConfirmOrder,
  adminDeleteListing,
  adminGetStore,
  adminGrantZone,
  adminUpdatePricing,
  adminUpsertListing,
  createAdminAdSlotApi,
  deleteAdminAdSlotApi,
  getAdSlots,
  getP2pEarningsApi,
  markP2pEarningPaidApi,
  toggleAdminAdSlotApi,
  type GatewayStatusDto,
} from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';

export function AdminStorePanel() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const [listings, setListings] = React.useState<StoreListingDto[]>([]);
  const [orders, setOrders] = React.useState<PaymentOrderDto[]>([]);
  const [custody, setCustody] = React.useState<ZoneCustodyDto[]>([]);
  const [gateways, setGateways] = React.useState<GatewayStatusDto | null>(null);

  const [pricing, setPricing] = React.useState<StorePricingDto>({
    customZoneEnabled: true,
    customZonePriceRub: 490,
    customZonePriceUsdt: 5,
    customSubdomainEnabled: true,
    customSubdomainPriceRub: 190,
    customSubdomainPriceUsdt: 2,
  });

  // Форма нового лота
  const [lotTld, setLotTld] = React.useState('');
  const [lotSub, setLotSub] = React.useState('');
  const [lotTitle, setLotTitle] = React.useState('');
  const [lotDesc, setLotDesc] = React.useState('');
  const [lotRub, setLotRub] = React.useState('490');
  const [lotUsdt, setLotUsdt] = React.useState('5');
  const [lotDays, setLotDays] = React.useState('365');

  // Форма прямой выдачи
  const [grantTld, setGrantTld] = React.useState('');
  const [grantSub, setGrantSub] = React.useState('');
  const [grantOwner, setGrantOwner] = React.useState('');
  const [grantDays, setGrantDays] = React.useState('365');

  const [ads, setAds] = React.useState<AdSlotDto[]>([]);
  const [adPlacement, setAdPlacement] = React.useState<AdPlacement>('store_top');
  const [adTitle, setAdTitle] = React.useState('');
  const [adDesc, setAdDesc] = React.useState('');
  const [adUrl, setAdUrl] = React.useState('');
  const [adCta, setAdCta] = React.useState('Открыть');
  const [adDays, setAdDays] = React.useState('30');
  const [p2pEarnings, setP2pEarnings] = React.useState<SellerEarningDto[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [res, adsRes, p2pRes] = await Promise.all([
        adminGetStore(),
        getAdSlots(undefined, true).catch(() => ({ ads: [] })),
        getP2pEarningsApi(true).catch(() => ({ allEarnings: [] })),
      ]);
      setListings(res.listings);
      setPricing(res.pricing);
      setOrders(res.orders);
      setCustody(res.custody);
      setGateways(res.gateways);
      setAds(adsRes.ads);
      setP2pEarnings(p2pRes.allEarnings ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки магазина');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const savePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminUpdatePricing({
        customZoneEnabled: pricing.customZoneEnabled,
        customZonePriceRub: Number(pricing.customZonePriceRub),
        customZonePriceUsdt: Number(pricing.customZonePriceUsdt),
        customSubdomainEnabled: pricing.customSubdomainEnabled,
        customSubdomainPriceRub: Number(pricing.customSubdomainPriceRub),
        customSubdomainPriceUsdt: Number(pricing.customSubdomainPriceUsdt),
      });
      toast.success('Тарифы магазина обновлены');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка сохранения тарифов');
    } finally {
      setBusy(false);
    }
  };

  const addListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminUpsertListing({
        tld: lotTld.trim(),
        subLabel: lotSub.trim(),
        title: lotTitle.trim(),
        description: lotDesc.trim(),
        priceRub: Number(lotRub),
        priceUsdt: Number(lotUsdt),
        periodDays: Number(lotDays) || 365,
        status: 'available',
      });
      setLotTld('');
      setLotSub('');
      setLotTitle('');
      setLotDesc('');
      toast.success('Лот добавлен на витрину');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка добавления лота');
    } finally {
      setBusy(false);
    }
  };

  const removeListing = async (id: string) => {
    setBusy(true);
    try {
      await adminDeleteListing(id);
      toast.success('Лот удалён');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка удаления лота');
    } finally {
      setBusy(false);
    }
  };

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminGrantZone({
        tld: grantTld.trim(),
        subLabel: grantSub.trim(),
        owner: grantOwner.trim(),
        periodDays: Number(grantDays) || 365,
      });
      toast.success('Права на домен успешно выданы');
      setGrantTld('');
      setGrantSub('');
      setGrantOwner('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка выдачи зоны');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmOrder = async (orderId: string) => {
    setBusy(true);
    try {
      await adminConfirmOrder(orderId);
      toast.success('Заказ подтверждён, права и стартовый сайт выданы');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка подтверждения заказа');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Статус шлюзов */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4 text-primary" />
              Статус платёжных шлюзов и Cloudflare DNS
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Webhook ЮMoney: <code className="mono">/api/payments/yoomoney/webhook</code> ·
              Webhook @CryptoBot: <code className="mono">/api/payments/cryptobot/webhook</code>
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant={gateways?.yoomoneyConfigured ? 'success' : 'warning'}>
            ЮMoney: {gateways?.yoomoneyConfigured ? 'Подключён' : 'Нужны YOOMONEY_WALLET & SECRET'}
          </Badge>
          <Badge variant={gateways?.cryptobotConfigured ? 'success' : 'warning'}>
            @CryptoBot: {gateways?.cryptobotConfigured ? 'Подключён' : 'Нужен CRYPTOBOT_API_TOKEN'}
          </Badge>
          <Badge variant={gateways?.cloudflareConfigured ? 'success' : 'warning'}>
            Cloudflare DNS:{' '}
            {gateways?.cloudflareConfigured ? 'Подключён' : 'Нужны CF_API_TOKEN & CF_ZONE_ID'}
          </Badge>
          <Badge variant={gateways?.sandboxEnabled ? 'default' : 'secondary'}>
            Sandbox: {gateways?.sandboxEnabled ? 'Включён (PAYMENTS_SANDBOX=true)' : 'Выключен'}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Тарифы */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Базовые тарифы на покупку зон</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={savePricing} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Цена новой зоны (RUB)</Label>
                <Input
                  type="number"
                  min={1}
                  value={pricing.customZonePriceRub}
                  onChange={(e) =>
                    setPricing((p) => ({ ...p, customZonePriceRub: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Цена новой зоны (USDT)</Label>
                <Input
                  type="number"
                  min={0.1}
                  step="0.1"
                  value={pricing.customZonePriceUsdt}
                  onChange={(e) =>
                    setPricing((p) => ({ ...p, customZonePriceUsdt: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Поддомен (RUB)</Label>
                <Input
                  type="number"
                  min={1}
                  value={pricing.customSubdomainPriceRub}
                  onChange={(e) =>
                    setPricing((p) => ({
                      ...p,
                      customSubdomainPriceRub: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Поддомен (USDT)</Label>
                <Input
                  type="number"
                  min={0.1}
                  step="0.1"
                  value={pricing.customSubdomainPriceUsdt}
                  onChange={(e) =>
                    setPricing((p) => ({
                      ...p,
                      customSubdomainPriceUsdt: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-xs sm:col-span-2">
                <input
                  type="checkbox"
                  checked={pricing.customZoneEnabled}
                  onChange={(e) =>
                    setPricing((p) => ({ ...p, customZoneEnabled: e.target.checked }))
                  }
                />
                Разрешить покупку произвольных новых зон в магазине
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy} className="gap-1.5">
                  <Save className="h-4 w-4" /> Сохранить тарифы
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Выдача зоны вручную */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="h-4 w-4 text-primary" />
              Выдать зону / поддомен пользователю
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleGrant} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Зона (.mybrand)</Label>
                <Input
                  required
                  className="mono"
                  placeholder=".vip"
                  value={grantTld}
                  onChange={(e) => setGrantTld(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Поддомен (опц.)</Label>
                <Input
                  className="mono"
                  placeholder="пусто = вся зона"
                  value={grantSub}
                  onChange={(e) => setGrantSub(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Владелец (0x-адрес или Email)</Label>
                <Input
                  required
                  placeholder="user@example.com или 0x..."
                  value={grantOwner}
                  onChange={(e) => setGrantOwner(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Срок (дней)</Label>
                <Input
                  type="number"
                  min={1}
                  value={grantDays}
                  onChange={(e) => setGrantDays(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={busy} className="w-full gap-1.5">
                  <Gift className="h-4 w-4" /> Выдать права и сайт
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Витрина лотов */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingBag className="h-4 w-4 text-primary" />
            Лоты витрины магазина ({listings.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addListing} className="grid gap-3 rounded-lg border p-3 md:grid-cols-6">
            <Input
              required
              className="mono"
              placeholder=".ai"
              value={lotTld}
              onChange={(e) => setLotTld(e.target.value)}
            />
            <Input
              required
              placeholder="Название (напр. Премиум .ai)"
              value={lotTitle}
              onChange={(e) => setLotTitle(e.target.value)}
              className="md:col-span-2"
            />
            <Input
              type="number"
              required
              placeholder="RUB"
              value={lotRub}
              onChange={(e) => setLotRub(e.target.value)}
            />
            <Input
              type="number"
              step="0.1"
              required
              placeholder="USDT"
              value={lotUsdt}
              onChange={(e) => setLotUsdt(e.target.value)}
            />
            <Button type="submit" disabled={busy} className="gap-1.5">
              <Plus className="h-4 w-4" /> Добавить лот
            </Button>
            <Input
              placeholder="Описание лота"
              value={lotDesc}
              onChange={(e) => setLotDesc(e.target.value)}
              className="md:col-span-4"
            />
            <Input
              className="mono"
              placeholder="Поддомен (опц.)"
              value={lotSub}
              onChange={(e) => setLotSub(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Дней"
              value={lotDays}
              onChange={(e) => setLotDays(e.target.value)}
            />
          </form>

          {listings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Лоты на витрину ещё не добавлены.</p>
          ) : (
            <div className="space-y-2">
              {listings.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono text-sm font-semibold">
                      {item.subLabel ? `${item.subLabel}${item.tld}` : item.tld}
                    </span>
                    <span>{item.title}</span>
                    <Badge variant={item.status === 'available' ? 'success' : 'secondary'}>
                      {item.status}
                    </Badge>
                    <span className="font-medium">
                      {item.priceRub} ₽ / {item.priceUsdt} USDT
                    </span>
                    <span className="text-muted-foreground">{item.periodDays} дн.</span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void removeListing(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Заказы и выданные права */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Заказы покупателей ({orders.length})</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-2 overflow-y-auto">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Заказов пока нет.</p>
            ) : (
              orders.map((ord) => (
                <div
                  key={ord.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-xs"
                >
                  <div>
                    <span className="mono font-semibold">{ord.tld}</span> · {ord.amount}{' '}
                    {ord.currency} ({ord.provider})
                    <div className="mono text-[11px] text-muted-foreground">
                      Покупатель: {ord.buyerAddress}
                    </div>
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
                      {ord.status}
                    </Badge>
                    {ord.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void handleConfirmOrder(ord.id)}
                        className="h-7 gap-1 text-xs"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Подтвердить
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Выданные платформенные права ({custody.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-2 overflow-y-auto">
            {custody.length === 0 ? (
              <p className="text-sm text-muted-foreground">Записей custody пока нет.</p>
            ) : (
              custody.map((c) => (
                <div key={c.id} className="rounded border px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="mono font-semibold">
                      {c.subLabel ? `${c.subLabel}${c.tld}` : c.tld}
                    </span>
                    <Badge variant="outline">{c.source}</Badge>
                  </div>
                  <div className="mono mt-1 text-[11px] text-muted-foreground">
                    {c.ownerAddress} · до {new Date(c.expiresAt).toLocaleDateString('ru-RU')}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Рекламные блоки и выплаты P2P */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-primary" />
              Рекламные блоки ({ads.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await createAdminAdSlotApi({
                    placement: adPlacement,
                    title: adTitle.trim(),
                    description: adDesc.trim(),
                    ctaLabel: adCta.trim() || 'Перейти',
                    targetUrl: adUrl.trim(),
                    days: Number(adDays) || 30,
                  });
                  toast.success('Рекламный блок добавлен');
                  setAdTitle('');
                  setAdDesc('');
                  setAdUrl('');
                  await load();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Ошибка');
                } finally {
                  setBusy(false);
                }
              }}
              className="grid gap-2 sm:grid-cols-2"
            >
              <select
                value={adPlacement}
                onChange={(e) => setAdPlacement(e.target.value as AdPlacement)}
                className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="store_top">Магазин (верх)</option>
                <option value="auctions_top">Аукционы (верх)</option>
                <option value="footer_sponsor">Футер сайта</option>
              </select>
              <Input
                type="number"
                min={1}
                placeholder="Дней"
                value={adDays}
                onChange={(e) => setAdDays(e.target.value)}
              />
              <Input
                required
                placeholder="Заголовок"
                value={adTitle}
                onChange={(e) => setAdTitle(e.target.value)}
                className="sm:col-span-2"
              />
              <Input
                required
                placeholder="Описание"
                value={adDesc}
                onChange={(e) => setAdDesc(e.target.value)}
                className="sm:col-span-2"
              />
              <Input
                required
                type="url"
                placeholder="Ссылка https://..."
                value={adUrl}
                onChange={(e) => setAdUrl(e.target.value)}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Кнопка"
                  value={adCta}
                  onChange={(e) => setAdCta(e.target.value)}
                />
                <Button type="submit" disabled={busy} className="shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </form>

            <div className="max-h-72 space-y-2 overflow-y-auto">
              {ads.map((ad) => (
                <div key={ad.id} className="rounded border px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{ad.title}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={ad.isActive ? 'success' : 'secondary'}>
                        {ad.placement} · {ad.clicksCount} клик.
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={async () => {
                          await toggleAdminAdSlotApi(ad.id, !ad.isActive);
                          await load();
                        }}
                      >
                        {ad.isActive ? 'Выкл' : 'Вкл'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive"
                        onClick={async () => {
                          await deleteAdminAdSlotApi(ad.id);
                          await load();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {ad.targetUrl} · до {new Date(ad.endsAt).toLocaleDateString('ru-RU')}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" />
              P2P-продажи и выплаты продавцам ({p2pEarnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-2 overflow-y-auto">
            {p2pEarnings.length === 0 ? (
              <p className="text-sm text-muted-foreground">P2P-продаж пока не было.</p>
            ) : (
              p2pEarnings.map((e) => (
                <div key={e.id} className="rounded border px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <strong className="mono">{e.tld}</strong> · продано за {e.grossRub} ₽
                      (комиссия {e.feeRub} ₽ · к выплате <strong>{e.netRub} ₽</strong>)
                    </span>
                    <Badge
                      variant={
                        e.status === 'paid'
                          ? 'success'
                          : e.status === 'requested'
                            ? 'warning'
                            : 'secondary'
                      }
                    >
                      {e.status}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="mono">
                      Продавец: {e.sellerAddress.slice(0, 12)}…
                      {e.payoutDestination ? ` · Реквизиты: ${e.payoutDestination}` : ''}
                    </span>
                    {e.status !== 'paid' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={async () => {
                          await markP2pEarningPaidApi(e.id);
                          toast.success('Отмечено как выплаченное');
                          await load();
                        }}
                      >
                        Отметить выплаченным
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
