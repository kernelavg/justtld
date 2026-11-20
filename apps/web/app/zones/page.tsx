'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { Paginated, ZoneDto } from '@justtld/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/primitives';
import { ZoneCard } from '@/components/zones/zone-card';
import { useI18n } from '@/lib/i18n';
import { useApiData } from '@/lib/hooks';
import { cn } from '@/lib/utils';

const STATUS_FILTERS = ['all', 'active', 'expired', 'blocked'] as const;
const SORTS = ['newest', 'oldest', 'tld', 'expires_soon'] as const;

export default function ZonesPage() {
  const { t } = useI18n();
  const [status, setStatus] = React.useState<(typeof STATUS_FILTERS)[number]>('all');
  const [sort, setSort] = React.useState<(typeof SORTS)[number]>('newest');
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);

  const query = React.useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: '12', status, sort });
    if (q.trim()) params.set('q', q.trim());
    return params.toString();
  }, [page, status, sort, q]);

  const { data, loading, error, reload } = useApiData<Paginated<ZoneDto>>(`/api/zones?${query}`, [
    query,
  ]);

  const filterLabel: Record<(typeof STATUS_FILTERS)[number], string> = {
    all: t('zones.filter.all'),
    active: t('zones.filter.active'),
    expired: t('zones.filter.expired'),
    blocked: t('zones.filter.blocked'),
  };
  const sortLabel: Record<(typeof SORTS)[number], string> = {
    newest: t('zones.sort.newest'),
    oldest: t('zones.sort.oldest'),
    tld: t('zones.sort.tld'),
    expires_soon: t('zones.sort.expires'),
  };

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('zones.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('zones.subtitle')}</p>
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder={t('zones.searchPlaceholder')}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={status === value ? 'default' : 'outline'}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {filterLabel[value]}
            </Button>
          ))}
        </div>

        <select
          aria-label="sort"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as (typeof SORTS)[number]);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {SORTS.map((value) => (
            <option key={value} value={value}>
              {sortLabel[value]}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <Card className="mt-6 border-destructive/40">
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-destructive">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={reload}>
              {t('common.retry')}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="mt-4 text-xs text-muted-foreground">
            {t('zones.found')}: {data.total}
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((zone) => (
              <ZoneCard key={zone.id} zone={zone} />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t('common.page')} {data.page} {t('common.of')} {data.pages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {t('common.prev')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={data.page >= data.pages}
                onClick={() => setPage((value) => value + 1)}
              >
                {t('common.next')}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {t('zones.emptyTitle')}. {t('zones.emptyText')}
            </p>
            <Button asChild size="sm">
              <Link href="/register">{t('nav.register')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <p className={cn('mt-8 text-center text-xs text-muted-foreground')}>{t('zone.cachedNote')}</p>
    </div>
  );
}
