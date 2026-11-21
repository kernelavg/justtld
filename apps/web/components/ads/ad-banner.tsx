'use client';

import * as React from 'react';
import {
  CheckCircle2,
  Coins,
  CreditCard,
  ExternalLink,
  Megaphone,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AdPlacement, AdSlotDto, PaymentOrderDto, PaymentProvider } from '@justtld/shared';
import { createMonetizationOrderApi, getAdSlots, getStoreOrder } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
} from '@/components/ui/primitives';

export function AdBanner({
  placement,
  isAuthenticated,
  isAdmin,
}: {
  placement: AdPlacement;
  isAuthenticated?: boolean;
  isAdmin?: boolean;
}) {
  const [ads, setAds] = React.useState<AdSlotDto[]>([]);
  const [buyOpen, setBuyOpen] = React.useState(false);

  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [targetUrl, setTargetUrl] = React.useState('');
  const [ctaLabel, setCtaLabel] = React.useState('Открыть');
  const [provider, setProvider] = React.useState<PaymentProvider>('yoomoney');
  const [submitting, setSubmitting] = React.useState(false);
  const [orderState, setOrderState] = React.useState<{
    order: PaymentOrderDto;
    payUrl: string | null;
    instructions: string;
  } | null>(null);

  const load = React.useCallback(() => {
    getAdSlots(placement)
      .then((res) => setAds(res.ads))
      .catch(() => undefined);
  }, [placement]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!orderState || orderState.order.status !== 'pending') return;
    const id = setInterval(() => {
      getStoreOrder(orderState.order.id)
        .then((res) => {
          setOrderState((prev) => (prev ? { ...prev, order: res.order } : prev));
          if (res.order.status === 'fulfilled' || res.order.status === 'paid') {
            toast.success('Рекламный блок опубликован на 7 дней!');
            setOrderState(null);
            load();
          }
        })
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(id);
  }, [orderState, load]);

  const submitAd = async (adminApply = false) => {
    setSubmitting(true);
    try {
      const res = await createMonetizationOrderApi(
        {
          kind: 'ad_slot',
          provider,
          currency: provider === 'cryptobot' ? 'USDT' : 'RUB',
          ad: {
            placement,
            title: title.trim(),
            description: description.trim(),
            ctaLabel: ctaLabel.trim() || 'Открыть',
            targetUrl: targetUrl.trim(),
            badgeText: 'Реклама',
          },
        },
        adminApply,
      );
      if (res.applied) {
        toast.success('Рекламный блок добавлен!');
        setBuyOpen(false);
        setTitle('');
        setDescription('');
        setTargetUrl('');
        load();
      } else if (res.order) {
        setBuyOpen(false);
        setOrderState({
          order: res.order,
          payUrl: res.payUrl ?? null,
          instructions: res.instructions ?? '',
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка оформления рекламы');
    } finally {
      setSubmitting(false);
    }
  };

  const mainAd = ads[0] ?? null;

  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        {mainAd ? (
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {mainAd.badgeText || 'Реклама'}
              </Badge>
              <span className="truncate text-sm font-semibold">{mainAd.title}</span>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{mainAd.description}</p>
          </div>
        ) : (
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Megaphone className="h-4 w-4 text-primary" />
              <span>Место для вашей рекламы в JustTLD</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Разместите ссылку на ваш канал, бота или сайт на 7 дней за 290 ₽ / 3 USDT.
            </p>
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {mainAd && (
            <Button asChild size="sm" variant="secondary" className="rounded-full">
              <a
                href={`/api/ads/${encodeURIComponent(mainAd.id)}/click`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {mainAd.ctaLabel || 'Открыть'}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="rounded-full text-xs"
            onClick={() => {
              if (!isAuthenticated) {
                toast.info('Войдите через Google, Email или кошелёк, чтобы разместить рекламу');
                return;
              }
              setBuyOpen(true);
            }}
          >
            Разместить за 290 ₽
          </Button>
        </div>
      </div>

      {/* Модалка размещения рекламы */}
      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Разместить рекламу на 7 дней</DialogTitle>
            <DialogDescription>
              Ваш блок сразу появится на этой странице и будет считать переходы. Стоимость — 290 ₽
              или 3 USDT.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitAd(false);
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label>Заголовок</Label>
              <Input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Наш крипто-бот в Telegram"
              />
            </div>
            <div className="space-y-1">
              <Label>Короткое описание</Label>
              <Input
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="1–2 предложения о вашем проекте"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ссылка (https://)</Label>
                <Input
                  required
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://t.me/..."
                />
              </div>
              <div className="space-y-1">
                <Label>Текст кнопки</Label>
                <Input
                  value={ctaLabel}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  placeholder="Перейти"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-xs ${
                  provider === 'yoomoney' ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <input
                  type="radio"
                  name="ad-provider"
                  checked={provider === 'yoomoney'}
                  onChange={() => setProvider('yoomoney')}
                />
                <CreditCard className="h-4 w-4 text-primary" />
                ЮMoney · 290 ₽
              </label>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-xs ${
                  provider === 'cryptobot' ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <input
                  type="radio"
                  name="ad-provider"
                  checked={provider === 'cryptobot'}
                  onChange={() => setProvider('cryptobot')}
                />
                <Coins className="h-4 w-4 text-primary" />
                @CryptoBot · 3 USDT
              </label>
            </div>

            <div className="flex flex-wrap justify-between gap-2 pt-2">
              {isAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => void submitAd(true)}
                  className="gap-1.5"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Добавить (админ)
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setBuyOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Создание…' : 'Оплатить'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Оплата рекламного заказа */}
      <Dialog open={Boolean(orderState)} onOpenChange={(o) => !o && setOrderState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Оплата рекламы</DialogTitle>
            <DialogDescription>
              Сумма: {orderState?.order.amount} {orderState?.order.currency}
            </DialogDescription>
          </DialogHeader>
          {orderState && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{orderState.instructions}</p>
              {orderState.order.status === 'pending' && orderState.payUrl && (
                <Button asChild size="lg" className="w-full gap-2">
                  <a href={orderState.payUrl} target="_blank" rel="noreferrer">
                    Оплатить {orderState.order.amount} {orderState.order.currency}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {orderState.order.status === 'pending' && (
                <Button
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={async () => {
                    const res = await getStoreOrder(orderState.order.id);
                    setOrderState((prev) => (prev ? { ...prev, order: res.order } : prev));
                    if (res.order.status === 'fulfilled') {
                      toast.success('Реклама активирована!');
                      setOrderState(null);
                      load();
                    }
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  Проверить оплату
                </Button>
              )}
              {orderState.order.status === 'fulfilled' && (
                <div className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  Опубликовано!
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
