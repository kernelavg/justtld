'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import {
  formatNumber,
  normalizeTld,
  type Paginated,
  type StatsDto,
  type ZoneDto,
} from '@justtld/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  const statCards = [
    { label: t('home.totalZones'), value: stats.data?.total },
    { label: t('home.activeZones'), value: stats.data?.active },
    { label: t('home.blockedZones'), value: stats.data?.blocked },
    { label: t('home.expiring'), value: stats.data?.expiringIn30d },
    { label: t('home.owners'), value: stats.data?.uniqueOwners },
    { label: t('home.events'), value: stats.data?.totalEvents },
  ];

  return (
    <div>
      <section className="gradient-hero border-b">
        <div className="container py-14 md:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> {t('home.badge')}
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-5xl">
              {t('home.title')}
            </h1>
            <p className="mt-3 text-lg font-medium text-primary">{t('app.tagline')}</p>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{t('home.subtitle')}</p>

            <form
              onSubmit={check}
              className="mx-auto mt-8 flex max-w-xl flex-col gap-2 sm:flex-row"
            >
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setAvailability(null);
                }}
                placeholder={t('home.searchPlaceholder')}
                className="mono h-12 text-base"
                aria-label={t('home.searchPlaceholder')}
              />
              <Button type="submit" size="lg" disabled={checking} className="h-12">
                {checking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {t('home.check')}
              </Button>
            </form>

            {availability && (
              <div className="mx-auto mt-3 max-w-xl text-left">
                {availability.available ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm text-success">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="mono font-medium">{availability.tld}</span> —{' '}
                      {t('home.available')}
                    </span>
                    <Button asChild size="sm" variant="success">
                      <Link href={`/register?tld=${encodeURIComponent(availability.tld)}`}>
                        {t('home.ctaRegister')}
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    <span className="flex items-center gap-2">
                      <CircleAlert className="h-4 w-4" />
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
                <Link href="/register">
                  {t('home.ctaRegister')} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/zones">{t('home.ctaExplore')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">{t('home.stats')}</h2>
          <span className="text-xs text-muted-foreground">
            {t('home.indexed')}:{' '}
            {stats.data ? formatNumber(stats.data.lastIndexedBlock, language) : '—'} ·{' '}
            {t('home.lag')}: {stats.data?.lag ?? '—'}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {statCards.map((card) => (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="text-2xl font-semibold tabular-nums">
                  {card.value === undefined ? (
                    <Skeleton className="h-7 w-12" />
                  ) : (
                    formatNumber(card.value, language)
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{card.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="container pb-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Wallet, title: t('home.step1.title'), text: t('home.step1.text') },
            { icon: ShieldCheck, title: t('home.step2.title'), text: t('home.step2.text') },
            { icon: Sparkles, title: t('home.step3.title'), text: t('home.step3.text') },
          ].map((step, index) => (
            <Card key={step.title} className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-primary">
                  <step.icon className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    0{index + 1}
                  </span>
                </div>
                <CardTitle className="pt-1 text-base">{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="container py-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">{t('home.recent')}</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/zones">
              {t('nav.zones')} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {recent.loading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32" />
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
