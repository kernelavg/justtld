'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Globe2,
  Layers,
  Loader2,
  Lock,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  formatNumber,
  normalizeTld,
  type Paginated,
  type StatsDto,
  type ZoneDto,
} from '@justtld/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/primitives';
import { ZoneCard } from '@/components/zones/zone-card';
import { describeReason } from '@/components/zones/register-form';
import { useI18n } from '@/lib/i18n';
import { useApiData } from '@/lib/hooks';
import { searchZones } from '@/lib/api';

export default function HomePage() {
  const { t, language } = useI18n();
  const stats = useApiData<StatsDto>('/api/stats');
  const recent = useApiData<Paginated<ZoneDto>>('/api/zones?sort=newest&limit=6&status=all');

  const [query, setQuery] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const [availability, setAvailability] = React.useState<{
    tld: string;
    available: boolean;
    reason: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const check = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const candidate = normalizeTld(query);
    if (!candidate || candidate === '.') return;
    setChecking(true);
    setError(null);
    setAvailability(null);
    try {
      const result = await searchZones(candidate);
      setAvailability(result.availability);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error.unknown'));
    } finally {
      setChecking(false);
    }
  };

  const previewZone = (query.trim().replace(/^\.+/, '').toLowerCase() || 'brand').replace(
    /[^a-z0-9-]/g,
    '',
  );

  return (
    <div>
      {/* Hero: на мобилке центрированный, на десктопе — полноценный 2-колоночный макет */}
      <section className="relative overflow-hidden gradient-hero">
        <div className="container py-14 md:py-20 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-10">
            {/* Левая колонка: оффер, поиск и кнопки */}
            <div className="mx-auto w-full min-w-0 max-w-xl text-center lg:col-span-6 lg:mx-0 lg:text-left">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span>{t('home.badge')}</span>
              </div>

              <h1 className="title-gradient text-[28px] leading-[1.12] font-semibold tracking-tight sm:text-5xl lg:text-[52px] lg:leading-[1.06]">
                Твоё пространство в сети.{' '}
                <span className="brand-text-gradient">За минуту.</span>
              </h1>

              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:mt-5 sm:text-base lg:max-w-lg">
                {t('home.subtitle')}
              </p>

              <form
                onSubmit={check}
                className="mx-auto mt-7 flex w-full max-w-md items-center gap-1 rounded-full border border-border/90 bg-card/85 p-1.5 shadow-2xl shadow-black/20 backdrop-blur-xl transition-colors focus-within:border-primary/50 lg:mx-0"
              >
                <Search className="ml-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setAvailability(null);
                  }}
                  placeholder={t('home.searchPlaceholder')}
                  className="mono h-9 min-w-0 flex-1 border-0 bg-transparent px-2 text-xs shadow-none focus-visible:ring-0 sm:text-sm"
                  aria-label={t('home.searchPlaceholder')}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={checking}
                  className="h-8 shrink-0 rounded-full px-3.5 sm:px-4"
                >
                  {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('home.check')}
                </Button>
              </form>

              {availability && (
                <div className="mx-auto mt-3 max-w-md text-left lg:mx-0">
                  {availability.available ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-success/30 bg-success/10 px-4 py-2.5 text-xs text-success">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span className="mono font-medium">{availability.tld}</span> —{' '}
                        {t('home.available')}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button asChild size="sm" variant="outline" className="h-7 rounded-full px-3">
                          <Link href={`/register?tld=${encodeURIComponent(availability.tld)}`}>
                            В блокчейне
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="success" className="h-7 rounded-full px-3">
                          <Link href="/store">Купить</Link>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
                      <span className="flex items-center gap-2">
                        <CircleAlert className="h-4 w-4 shrink-0" />
                        <span className="mono font-medium">{availability.tld}</span> —{' '}
                        {describeReason(availability.reason, language)}
                      </span>
                      <Button asChild size="sm" variant="outline" className="h-7 rounded-full px-3">
                        <Link href={`/zone/${availability.tld}`}>{t('common.openZone')}</Link>
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

              <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start">
                <Button asChild size="lg" className="rounded-full px-6">
                  <Link href="/store">
                    Открыть магазин <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full px-6">
                  <Link href="/zones">{t('home.ctaExplore')}</Link>
                </Button>
              </div>
            </div>

            {/* Правая колонка: живое превью окна браузера (на десктопе справа, на мобилке снизу) */}
            <div className="mx-auto w-full min-w-0 max-w-xl lg:col-span-6 lg:max-w-none">
              <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/65 shadow-2xl shadow-black/30 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5 sm:px-4 sm:py-3">
                  <div className="hidden items-center gap-1.5 sm:flex">
                    <span className="h-2.5 w-2.5 rounded-full bg-foreground/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-foreground/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-foreground/20" />
                  </div>
                  <div className="mono flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[11px] text-muted-foreground sm:flex-initial">
                    <Lock className="h-3 w-3 shrink-0 text-success" />
                    <span className="truncate">
                      https://<span className="text-foreground">{previewZone || 'brand'}</span>
                      .justtld.online
                    </span>
                  </div>
                  <span className="hidden rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-flex">
                    HTTPS
                  </span>
                </div>

                <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
                  <div className="grid grid-cols-3 divide-x divide-border/50">
                    <div className="min-w-0 pr-2 sm:pr-3">
                      <div className="truncate text-[10px] text-muted-foreground sm:text-[11px]">Всего зон</div>
                      <div className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                        {stats.data ? formatNumber(stats.data.total, language) : '—'}
                      </div>
                    </div>
                    <div className="min-w-0 px-2.5 sm:px-4">
                      <div className="truncate text-[10px] text-muted-foreground sm:text-[11px]">Активных</div>
                      <div className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                        {stats.data ? formatNumber(stats.data.active, language) : '—'}
                      </div>
                    </div>
                    <div className="min-w-0 pl-2.5 sm:pl-4">
                      <div className="truncate text-[10px] text-muted-foreground sm:text-[11px]">Владельцев</div>
                      <div className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                        {stats.data ? formatNumber(stats.data.uniqueOwners, language) : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-border/50 pt-4 text-xs">
                    {[
                      { host: `${previewZone || 'brand'}.justtld.online`, tag: 'Сайт' },
                      { host: `app.${previewZone || 'brand'}.justtld.online`, tag: 'Поддомен' },
                      { host: `dns.${previewZone || 'brand'}.justtld.online`, tag: 'DNS' },
                    ].map((row) => (
                      <div
                        key={row.host}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/50 px-3 py-2"
                      >
                        <span className="mono min-w-0 truncate text-foreground/90">{row.host}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{row.tag}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Чистая 3-колоночная сетка */}
      <section className="border-y border-border/50 bg-card/20">
        <div className="container grid divide-y divide-border/50 md:grid-cols-3 md:divide-x md:divide-y-0">
          {[
            { icon: Sparkles, title: t('home.step1.title'), text: t('home.step1.text') },
            { icon: Globe2, title: t('home.step2.title'), text: t('home.step2.text') },
            { icon: Layers, title: t('home.step3.title'), text: t('home.step3.text') },
          ].map((step) => (
            <div key={step.title} className="py-8 md:px-8 first:md:pl-0 last:md:pr-0">
              <step.icon className="mb-3 h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium tracking-tight">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Последние зоны */}
      <section className="container py-14">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium tracking-tight text-muted-foreground">
            {t('home.recent')}
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/zones">
              {t('nav.zones')} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {recent.loading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : recent.data && recent.data.items.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.data.items.map((zone) => (
              <ZoneCard key={zone.id} zone={zone} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-border/60 p-8 text-center text-sm text-muted-foreground">
            {t('zones.emptyTitle')}. {t('zones.emptyText')}
          </div>
        )}
      </section>
    </div>
  );
}
