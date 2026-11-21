'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  ExternalLink,
  Gavel,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  AuctionBidDto,
  AuctionDto,
  PaymentOrderDto,
  PaymentProvider,
} from '@justtld/shared';
import {
  cancelAuctionApi,
  claimAuctionApi,
  getAuctionDetail,
  getAuctions,
  getSession,
  getStoreOrder,
  openAuction,
  placeAuctionBidApi,
  type SessionResponse,
  type StoreCatalogResponse,
} from '@/lib/api';
import { EmailAuthCard } from '@/components/auth/email-auth-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Skeleton,
} from '@/components/ui/primitives';

function formatRemaining(endsAt: string, nowMs: number): string {
  const diff = new Date(endsAt).getTime() - nowMs;
  if (diff <= 0) return 'Торги завершены';
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${mins}м`;
  return `${mins}м ${secs.toString().padStart(2, '0')}с`;
}

export default function AuctionsPage() {
  const [auctions, setAuctions] = React.useState<AuctionDto[]>([]);
  const [gateways, setGateways] = React.useState<StoreCatalogResponse['gateways'] | null>(null);
  const [sessionState, setSessionState] = React.useState<SessionResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<'all' | 'active' | 'finished'>('all');
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  // Открытие нового аукциона
  const [openModal, setOpenModal] = React.useState(false);
  const [newTld, setNewTld] = React.useState('');
  const [newTitle, setNewTitle] = React.useState('');
  const [newStartPrice, setNewStartPrice] = React.useState(190);
  const [newHours, setNewHours] = React.useState(72);
  const [creating, setCreating] = React.useState(false);

  // Просмотр ставок и размещение ставки
  const [selected, setSelected] = React.useState<AuctionDto | null>(null);
  const [bids, setBids] = React.useState<AuctionBidDto[]>([]);
  const [loadingBids, setLoadingBids] = React.useState(false);
  const [bidAmount, setBidAmount] = React.useState(0);
  const [placingBid, setPlacingBid] = React.useState(false);

  // Выкуп выигранного аукциона
  const [claimTarget, setClaimTarget] = React.useState<AuctionDto | null>(null);
  const [provider, setProvider] = React.useState<PaymentProvider>('yoomoney');
  const [claiming, setClaiming] = React.useState(false);
  const [claimOrder, setClaimOrder] = React.useState<{
    order: PaymentOrderDto;
    payUrl: string | null;
    instructions: string;
  } | null>(null);
  const [checkingOrder, setCheckingOrder] = React.useState(false);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [res, sess] = await Promise.all([getAuctions('all'), getSession()]);
      setAuctions(res.auctions);
      setGateways(res.gateways);
      setSessionState(sess);
      if (!res.gateways.yoomoneyConfigured && res.gateways.cryptobotConfigured) {
        setProvider('cryptobot');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить аукционы');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  React.useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (!claimOrder || claimOrder.order.status !== 'pending') return;
    const id = setInterval(() => {
      getStoreOrder(claimOrder.order.id)
        .then((res) => {
          setClaimOrder((prev) =>
            prev ? { ...prev, order: res.order, payUrl: res.order.payUrl ?? prev.payUrl } : prev,
          );
          if (res.order.status === 'fulfilled' || res.order.status === 'paid') {
            toast.success(`Оплата получена! Зона ${res.order.tld} активирована.`);
            void loadAll();
          }
        })
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(id);
  }, [claimOrder, loadAll]);

  const userAddr = sessionState?.session?.address?.toLowerCase() ?? null;
  const isAdmin = sessionState?.session?.role === 'admin';
  const isAuthenticated = Boolean(userAddr);

  const openAuctionDetail = async (auction: AuctionDto) => {
    setSelected(auction);
    const minNext =
      auction.bidsCount === 0
        ? auction.startPriceRub
        : auction.currentBidRub + auction.minStepRub;
    setBidAmount(minNext);
    setLoadingBids(true);
    try {
      const detail = await getAuctionDetail(auction.id);
      setSelected(detail.auction);
      setBids(detail.bids);
    } catch {
      setBids([]);
    } finally {
      setLoadingBids(false);
    }
  };

  const handleOpenNewAuction = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const clean = newTld.trim().toLowerCase().replace(/^\.+/, '');
      const res = await openAuction({
        tld: `.${clean}`,
        title: newTitle.trim() || undefined,
        startPriceRub: newStartPrice,
        minStepRub: 50,
        durationHours: newHours,
      });
      toast.success(`Аукцион для ${res.auction.tld} запущен!`);
      setOpenModal(false);
      setNewTld('');
      setNewTitle('');
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось открыть аукцион');
    } finally {
      setCreating(false);
    }
  };

  const handlePlaceBid = async () => {
    if (!selected) return;
    setPlacingBid(true);
    try {
      const res = await placeAuctionBidApi(selected.id, bidAmount);
      toast.success(`Ставка ${bidAmount} ₽ принята! Вы лидируете.`);
      setSelected(res.auction);
      await openAuctionDetail(res.auction);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сделать ставку');
    } finally {
      setPlacingBid(false);
    }
  };

  const handleClaimSubmit = async (adminGrant = false) => {
    if (!claimTarget) return;
    setClaiming(true);
    try {
      const res = await claimAuctionApi(
        claimTarget.id,
        adminGrant
          ? { adminGrant: true }
          : {
              provider,
              currency: provider === 'cryptobot' ? 'USDT' : 'RUB',
            },
      );
      if (res.granted) {
        toast.success(`Зона ${claimTarget.tld} передана победителю!`);
        setClaimTarget(null);
        await loadAll();
      } else if (res.order) {
        setClaimOrder({
          order: res.order,
          payUrl: res.payUrl ?? null,
          instructions: res.instructions ?? '',
        });
        setClaimTarget(null);
        toast.success('Счёт выставлен — нажмите кнопку оплаты');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка оформления');
    } finally {
      setClaiming(false);
    }
  };

  const handleCancelAuction = async (auction: AuctionDto) => {
    try {
      await cancelAuctionApi(auction.id);
      toast.success(`Аукцион ${auction.tld} отменён`);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось отменить');
    }
  };

  const visibleAuctions = React.useMemo(() => {
    if (filter === 'active') return auctions.filter((a) => a.status === 'active');
    if (filter === 'finished') return auctions.filter((a) => a.status !== 'active');
    return auctions;
  }, [auctions, filter]);

  return (
    <div className="container max-w-6xl space-y-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs text-muted-foreground">
            <Gavel className="h-3.5 w-3.5 text-primary" />
            <span>Торги в стиле Handshake</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Аукционы зон</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Открывайте торги на свободные зоны, делайте ставки и забирайте победившие домены со
            встроенным сайтом и DNS.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadAll()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Обновить
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (!isAuthenticated) {
                toast.info('Войдите через Google, Email или кошелёк, чтобы открыть аукцион');
                return;
              }
              setOpenModal(true);
            }}
            className="gap-1.5 rounded-full px-4"
          >
            <Plus className="h-3.5 w-3.5" />
            Открыть аукцион
          </Button>
        </div>
      </div>

      {!isAuthenticated && (
        <div className="mx-auto max-w-md">
          <EmailAuthCard
            title="Вход для участия в торгах"
            description="Авторизуйтесь через Google или Email, чтобы делать ставки и открывать аукционы."
            googleAuthEnabled={sessionState?.googleAuthEnabled}
            onSuccess={() => void loadAll()}
          />
        </div>
      )}

      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { id: 'all' as const, label: `Все (${auctions.length})` },
          {
            id: 'active' as const,
            label: `Идёт торг (${auctions.filter((a) => a.status === 'active').length})`,
          },
          {
            id: 'finished' as const,
            label: `Завершённые (${auctions.filter((a) => a.status !== 'active').length})`,
          },
        ].map((tab) => (
          <Button
            key={tab.id}
            size="sm"
            variant={filter === tab.id ? 'default' : 'ghost'}
            onClick={() => setFilter(tab.id)}
            className="rounded-full px-4"
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Сетка аукционов */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      ) : visibleAuctions.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Пока нет аукционов в этой категории. Нажмите «Открыть аукцион», чтобы запустить торги
            на любую свободную зону!
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleAuctions.map((auction) => {
            const isLeader = Boolean(
              userAddr && auction.leaderAddress?.toLowerCase() === userAddr,
            );
            const active = auction.status === 'active' && new Date(auction.endsAt).getTime() > nowMs;
            const displayPrice =
              auction.bidsCount > 0 ? auction.currentBidRub : auction.startPriceRub;

            return (
              <Card key={auction.id} className="card-hover flex min-w-0 flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="mono text-xl font-semibold">{auction.tld}</CardTitle>
                    {auction.status === 'active' ? (
                      <Badge variant="outline" className="gap-1 text-[11px]">
                        <Clock className="h-3 w-3 text-primary" />
                        {formatRemaining(auction.endsAt, nowMs)}
                      </Badge>
                    ) : auction.status === 'awaiting_payment' ? (
                      <Badge variant="warning">Ждёт оплаты</Badge>
                    ) : auction.status === 'settled' ? (
                      <Badge variant="success">Выдана</Badge>
                    ) : (
                      <Badge variant="secondary">Отменён</Badge>
                    )}
                  </div>
                  <CardDescription className="line-clamp-1">{auction.title}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {auction.description ? (
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {auction.description}
                    </p>
                  ) : null}

                  <div className="space-y-1.5 rounded-xl border border-border/60 bg-background/50 p-3 text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-muted-foreground">
                        {auction.bidsCount > 0 ? 'Текущая ставка' : 'Стартовая цена'}
                      </span>
                      <span className="text-base font-semibold tracking-tight tabular-nums">
                        {displayPrice} ₽
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Ставок / Шаг</span>
                      <span>
                        {auction.bidsCount} · +{auction.minStepRub} ₽
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Лидер</span>
                      <span className="truncate font-medium">
                        {auction.leaderLabel ? (
                          isLeader ? (
                            <span className="text-success">Вы лидируете</span>
                          ) : (
                            auction.leaderLabel
                          )
                        ) : (
                          'Пока нет ставок'
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {active && (
                      <Button
                        className="flex-1 rounded-full"
                        onClick={() => void openAuctionDetail(auction)}
                      >
                        <Gavel className="h-3.5 w-3.5" />
                        {isLeader ? 'История ставок' : 'Сделать ставку'}
                      </Button>
                    )}

                    {auction.status === 'awaiting_payment' && (isLeader || isAdmin) && (
                      <Button
                        className="flex-1 rounded-full"
                        variant="brand"
                        onClick={() => setClaimTarget(auction)}
                      >
                        <Trophy className="h-3.5 w-3.5" />
                        Забрать зону
                      </Button>
                    )}

                    {auction.status === 'settled' && (
                      <Button asChild variant="outline" className="w-full rounded-full">
                        <Link href={`/zone/${encodeURIComponent(auction.tld)}?tab=site`}>
                          Открыть зону и сайт <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}

                    {isAdmin && (auction.status === 'active' || auction.status === 'awaiting_payment') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-destructive"
                        onClick={() => void handleCancelAuction(auction)}
                      >
                        Отменить
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Модалка: открыть новый аукцион */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Открыть аукцион на зону</DialogTitle>
            <DialogDescription>
              Как в Handshake: введите любую свободную зону — после старта любой сможет делать
              ставки. Если ставку делают за 5 минут до конца, таймер продлевается.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleOpenNewAuction} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Имя зоны</Label>
              <div className="flex items-center gap-1.5">
                <span className="mono text-lg font-bold text-muted-foreground">.</span>
                <Input
                  required
                  value={newTld}
                  onChange={(e) => setNewTld(e.target.value)}
                  placeholder="meta"
                  className="mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Описание (необязательно)</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Кратко о зоне"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Старт (₽)</Label>
                <Input
                  type="number"
                  min={50}
                  max={1000000}
                  value={newStartPrice}
                  onChange={(e) => setNewStartPrice(Number(e.target.value) || 190)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Длительность</Label>
                <select
                  value={newHours}
                  onChange={(e) => setNewHours(Number(e.target.value))}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value={24}>24 часа</option>
                  <option value={72}>3 дня</option>
                  <option value={120}>5 дней</option>
                  <option value={168}>7 дней</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Запуск…' : 'Запустить торги'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Модалка: ставка и история ставок */}
      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-6">
              <span className="mono">{selected?.tld}</span>
              {selected && (
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3 text-primary" />
                  {formatRemaining(selected.endsAt, nowMs)}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>{selected?.title}</DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              {(() => {
                const minNext =
                  selected.bidsCount === 0
                    ? selected.startPriceRub
                    : selected.currentBidRub + selected.minStepRub;
                const isLeading = Boolean(
                  userAddr && selected.leaderAddress?.toLowerCase() === userAddr,
                );
                return (
                  <div className="space-y-3 rounded-xl border border-border/70 bg-background/50 p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">Минимальная ставка</span>
                      <span className="text-lg font-semibold">{minNext} ₽</span>
                    </div>

                    {!isAuthenticated ? (
                      <p className="text-xs text-muted-foreground">
                        Войдите через Google, Email или кошелёк, чтобы сделать ставку.
                      </p>
                    ) : isLeading ? (
                      <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        Ваша ставка сейчас лидирует! Дождитесь окончания торгов или перебития.
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={minNext}
                            value={bidAmount}
                            onChange={(e) => setBidAmount(Number(e.target.value) || minNext)}
                          />
                          <Button
                            disabled={placingBid || bidAmount < minNext}
                            onClick={() => void handlePlaceBid()}
                            className="shrink-0"
                          >
                            {placingBid ? 'Отправка…' : 'Поставить'}
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {[0, 50, 150, 500].map((extra) => (
                            <Button
                              key={extra}
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setBidAmount(minNext + extra)}
                              className="h-7 rounded-full px-3 text-xs"
                            >
                              {minNext + extra} ₽
                            </Button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">История ставок</div>
                {loadingBids ? (
                  <Skeleton className="h-16" />
                ) : bids.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Ставок пока нет — ваша станет первой!
                  </p>
                ) : (
                  <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {bids.map((b, idx) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {idx === 0 && <Trophy className="h-3.5 w-3.5 shrink-0 text-warning" />}
                          <span className="truncate font-medium">{b.bidderLabel}</span>
                        </div>
                        <span className="mono font-semibold">{b.amountRub} ₽</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Модалка: оплатить или выдать выигранный аукцион */}
      <Dialog open={Boolean(claimTarget)} onOpenChange={(o) => !o && setClaimTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Выкуп выигранной зоны <span className="mono">{claimTarget?.tld}</span>
            </DialogTitle>
            <DialogDescription>
              Победная ставка:{' '}
              <strong className="text-foreground">{claimTarget?.currentBidRub} ₽</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                provider === 'yoomoney' ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="auction-provider"
                  checked={provider === 'yoomoney'}
                  onChange={() => setProvider('yoomoney')}
                />
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CreditCard className="h-4 w-4 text-primary" />
                  ЮMoney (карта / кошелёк)
                </div>
              </div>
              <span className="text-sm font-semibold">{claimTarget?.currentBidRub} ₽</span>
            </label>

            <label
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                provider === 'cryptobot' ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="auction-provider"
                  checked={provider === 'cryptobot'}
                  onChange={() => setProvider('cryptobot')}
                />
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Coins className="h-4 w-4 text-primary" />
                  @CryptoBot (USDT)
                </div>
              </div>
              <span className="text-xs text-muted-foreground">в USDT</span>
            </label>
          </div>

          <div className="flex flex-wrap justify-between gap-2 pt-2">
            {isAdmin ? (
              <Button
                variant="outline"
                disabled={claiming}
                onClick={() => void handleClaimSubmit(true)}
                className="gap-1.5"
              >
                <ShieldCheck className="h-4 w-4" />
                Выдать победителю (админ)
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setClaimTarget(null)}>
                Отмена
              </Button>
              <Button disabled={claiming} onClick={() => void handleClaimSubmit(false)}>
                {claiming ? 'Создание счёта…' : 'Перейти к оплате'}
              </Button>
            </div>
          </div>

          {gateways && !gateways.yoomoneyConfigured && !gateways.cryptobotConfigured && (
            <p className="text-xs text-muted-foreground">
              Платёжные шлюзы не настроены на сервере.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Модалка выставленного счёта после выкупа */}
      <Dialog open={Boolean(claimOrder)} onOpenChange={(o) => !o && setClaimOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Оплата зоны <span className="mono">{claimOrder?.order.tld}</span>
            </DialogTitle>
            <DialogDescription>
              Сумма: {claimOrder?.order.amount} {claimOrder?.order.currency}
            </DialogDescription>
          </DialogHeader>
          {claimOrder && (
            <div className="space-y-3">
              {claimOrder.instructions && (
                <p className="text-sm text-muted-foreground">{claimOrder.instructions}</p>
              )}
              {claimOrder.order.status === 'pending' && claimOrder.payUrl && (
                <Button asChild size="lg" className="w-full gap-2">
                  <a href={claimOrder.payUrl} target="_blank" rel="noreferrer">
                    Оплатить {claimOrder.order.amount} {claimOrder.order.currency}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {claimOrder.order.status === 'pending' && (
                <Button
                  variant="outline"
                  className="w-full gap-1.5"
                  disabled={checkingOrder}
                  onClick={async () => {
                    setCheckingOrder(true);
                    try {
                      const res = await getStoreOrder(claimOrder.order.id);
                      setClaimOrder((prev) =>
                        prev ? { ...prev, order: res.order } : prev,
                      );
                      if (res.order.status === 'fulfilled' || res.order.status === 'paid') {
                        toast.success(`Зона ${res.order.tld} выдана!`);
                        await loadAll();
                      }
                    } finally {
                      setCheckingOrder(false);
                    }
                  }}
                >
                  <RefreshCw className={`h-4 w-4 ${checkingOrder ? 'animate-spin' : ''}`} />
                  Проверить оплату
                </Button>
              )}
              {(claimOrder.order.status === 'fulfilled' || claimOrder.order.status === 'paid') && (
                <Button asChild className="w-full gap-2">
                  <Link href={`/zone/${encodeURIComponent(claimOrder.order.tld)}?tab=site`}>
                    <CheckCircle2 className="h-4 w-4" />
                    Открыть управление зоной
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
