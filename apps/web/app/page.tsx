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
import { Card, CardContent } from '@/components/ui/card';
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

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/50 gradient-hero">
        <div className="bg-grid-subtle pointer-events-none absolute inset-0 opacity-25 [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_70%)]" />
        <div className="container relative py-20 md:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur-md">
              <img src="/brand/icon.png" alt="" className="h-3.5 w-3.5 rounded-[4px]" />
              <span>{t('home.badge')}</span>
            </div>

            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl md:text-[54px] md:leading-[1.08]">
              Своя доменная зона{' '}
              <span className="brand-text-gradient block sm:inline">за минуту</span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              {t('home.subtitle')}
            </p>

            {/* Поиск */}
            <form
              onSubmit={check}
              className="mx-auto mt-9 flex max-w-lg items-center gap-1.5 rounded-xl border border-border/80 bg-card/85 p-1.5 shadow-xl shadow-black/10 backdrop-blur-xl"
            >
              <Search className="ml-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setAvailability(null);
                }}
                placeholder={t('home.searchPlaceholder')}
                className="mono h-9 border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
                aria-label={t('home.searchPlaceholder')}
              />
              <Button type="submit" size="sm" disabled={checking} className="h-9 shrink-0 px-4">
                {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('home.check')}
              </Button>
            </form>

            {availability && (
              <div className="mx-auto mt-3 max-w-lg text-left">
                {availability.available ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/35 bg-success/10 px-4 py-2.5 text-sm text-success">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span className="mono font-medium">{availability.tld}</span> —{' '}
                      {t('home.available')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/register?tld=${encodeURIComponent(availability.tld)}`}>
                          В блокчейне
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="success">
                        <Link href="/store">Купить</Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                    <span className="flex items-center gap-2">
                      <CircleAlert className="h-4 w-4 shrink-0" />
                      <span className="mono font-medium">{availability.tld}</span> —{' '}
                      {describeReason(availability.reason, language)}
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/zone/${availability.tld}`}>{t('common.openZone')}</Link>
                    </Button>
                  </div>
                )}
              </div>
            )}
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/store">
                  Открыть магазин <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/zones">{t('home.ctaExplore')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Компактная статистика */}
      <section className="border-b border-border/40 bg-card/25">
        <div className="container grid grid-cols-3 divide-x divide-border/50 py-6 text-center">
          <div>
            <div className="text-2xl font-semibold tracking-tight tabular-nums">
              {stats.data ? formatNumber(stats.data.total, language) : '—'}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{t('home.totalZones')}</div>
          </div>
          <div>
            <div className="text-2xl font-semibold tracking-tight tabular-nums">
              {stats.data ? formatNumber(stats.data.active, language) : '—'}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{t('home.activeZones')}</div>
          </div>
          <div>
            <div className="text-2xl font-semibold tracking-tight tabular-nums">
              {stats.data ? formatNumber(stats.data.uniqueOwners, language) : '—'}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{t('home.owners')}</div>
          </div>
        </div>
      </section>

      {/* 3 ключевые возможности — чисто и без лишнего шума */}
      <section className="container py-14">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Sparkles, title: t('home.step1.title'), text: t('home.step1.text') },
            { icon: Globe2, title: t('home.step2.title'), text: t('home.step2.text') },
            { icon: Layers, title: t('home.step3.title'), text: t('home.step3.text') },
          ].map((step) => (
            <div
              key={step.title}
              className="rounded-xl border border-border/60 bg-card/50 p-6 transition-colors hover:border-border"
            >
              <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-secondary/70 text-primary">
                <step.icon className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Последние зоны */}
      <section className="container pb-16">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{t('home.recent')}</h2>
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
          <Card className="mt-4">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {t('zones.emptyTitle')}. {t('zones.emptyText')}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
