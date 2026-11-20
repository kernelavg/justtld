'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ExternalLink, History, ShieldAlert } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useApiData } from '@/lib/hooks';
import {
  formatDateTime,
  normalizeTld,
  shortenAddress,
  type ZoneDto,
  type ZoneEventDto,
  type Paginated,
} from '@justtld/shared';
import { Alert, AlertDescription, AlertTitle, Skeleton } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ZoneStatusBadge } from '@/components/zones/status-badge';
import { ZoneActions } from '@/components/zones/zone-actions';
import { useExplorerUrl } from '@/components/tx/tx-status';

type ZoneResponse = {
  zone: ZoneDto | null;
  chain: {
    owner: string;
    registeredAt: number;
    expiresAt: number;
    updatedAt: number;
    blocked: boolean;
    metadata: string;
  } | null;
  consistent: boolean;
  transfers: unknown[];
};

export default function ZonePage() {
  const params = useParams<{ tld: string }>();
  const rawTld = decodeURIComponent(params?.tld ?? '');
  const tld = normalizeTld(rawTld);
  const { t, language } = useI18n();
  const txUrl = useExplorerUrl();

  const zone = useApiData<ZoneResponse>(`/api/zones/${encodeURIComponent(tld)}`, [tld]);
  const history = useApiData<Paginated<ZoneEventDto> & { tld: string }>(
    `/api/zones/${encodeURIComponent(tld)}/history?limit=20`,
    [tld],
  );

  const reload = () => {
    zone.reload();
    history.reload();
  };

  if (zone.loading) {
    return (
      <div className="container space-y-4 py-10">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (zone.error || (!zone.data?.zone && !zone.data?.chain)) {
    return (
      <div className="container py-16">
        <Card className="mx-auto max-w-lg">
          <CardContent className="space-y-4 p-8 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
            <h1 className="text-xl font-semibold">{t('common.notFound')}</h1>
            <p className="text-sm text-muted-foreground">
              {zone.error ?? `${tld} не зарегистрирована`}
            </p>
            <div className="flex justify-center gap-2">
              <Button asChild variant="outline">
                <Link href="/zones">
                  <ArrowLeft className="h-4 w-4" /> {t('nav.zones')}
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/register?tld=${encodeURIComponent(tld)}`}>{t('nav.register')}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cached = zone.data?.zone ?? null;
  const chain = zone.data?.chain ?? null;
  const view = cached ?? {
    id: '',
    tld,
    ownerAddress: chain?.owner ?? '',
    status: chain?.blocked ? 'blocked' : 'active',
    registeredAt: new Date((chain?.registeredAt ?? 0) * 1000).toISOString(),
    expiresAt: new Date((chain?.expiresAt ?? 0) * 1000).toISOString(),
    metadata: chain?.metadata ?? '',
    transactionHash: '',
    blockNumber: 0,
    createdAt: '',
    updatedAt: '',
  };

  return (
    <div className="container py-10">
      <Link
        href="/zones"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t('nav.zones')}
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="mono text-3xl font-bold tracking-tight">{view.tld}</h1>
          <ZoneStatusBadge status={view.status} />
          {!zone.data?.consistent && (
            <Badge variant="warning">
              <AlertTriangle className="mr-1 h-3 w-3" /> cache ≠ chain
            </Badge>
          )}
        </div>
        <ZoneActions zone={view as ZoneDto} onChanged={reload} />
      </div>

      {view.status === 'blocked' && (
        <Alert variant="destructive" className="mt-4">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>{t('common.blocked')}</AlertTitle>
          <AlertDescription>{t('zone.blockedBanner')}</AlertDescription>
        </Alert>
      )}

      {view.status === 'expired' && (
        <Alert variant="warning" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('common.expired')}</AlertTitle>
          <AlertDescription>{t('zone.expiredBanner')}</AlertDescription>
        </Alert>
      )}

      {!zone.data?.consistent && (
        <Alert variant="warning" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('zone.inconsistent')}</AlertTitle>
          <AlertDescription>
            {t('zone.cachedNote')} — {t('zone.chainState')}:{' '}
            {chain ? shortenAddress(chain.owner, 6) : '—'}
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('zone.fromIndexer')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label={t('zone.owner')}>
              <Link
                href={`/address/${view.ownerAddress}`}
                className="mono text-sm hover:text-primary"
              >
                {view.ownerAddress}
              </Link>
            </Field>
            <Field label={t('zone.status')}>
              <ZoneStatusBadge status={view.status} />
            </Field>
            <Field label={t('zone.registeredAt')}>
              {formatDateTime(view.registeredAt, language)}
            </Field>
            <Field label={t('zone.expiresAt')}>{formatDateTime(view.expiresAt, language)}</Field>
            <Field label={t('common.transaction')}>
              {view.transactionHash ? (
                <Link
                  href={txUrl(view.transactionHash)}
                  className="mono inline-flex items-center gap-1 text-sm hover:text-primary"
                >
                  {shortenAddress(view.transactionHash, 8)} <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                '—'
              )}
            </Field>
            <Field label={t('common.block')}>{view.blockNumber || '—'}</Field>
            <div className="sm:col-span-2">
              <Field label={t('common.metadata')}>
                {view.metadata ? (
                  <pre className="mono max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
                    {view.metadata}
                  </pre>
                ) : (
                  <span className="text-sm text-muted-foreground">{t('zone.metadataEmpty')}</span>
                )}
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('zone.chainState')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {chain ? (
              <>
                <Field label={t('zone.owner')}>
                  <span className="mono text-xs">{chain.owner}</span>
                </Field>
                <Field label={t('zone.registeredAt')}>
                  {formatDateTime(chain.registeredAt, language)}
                </Field>
                <Field label={t('zone.expiresAt')}>
                  {formatDateTime(chain.expiresAt, language)}
                </Field>
                <Field label={t('common.blocked')}>{chain.blocked ? 'true' : 'false'}</Field>
              </>
            ) : (
              <p className="text-muted-foreground">Зона отсутствует в контракте</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> {t('zone.history')}
          </CardTitle>
          <span className="text-xs text-muted-foreground">{history.data?.total ?? 0}</span>
        </CardHeader>
        <CardContent>
          {history.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : history.data && history.data.items.length > 0 ? (
            <ol className="space-y-3">
              {history.data.items.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{event.eventType}</Badge>
                    <span className="mono text-xs text-muted-foreground">
                      {shortenAddress(event.actorAddress, 5)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>#{event.blockNumber}</span>
                    <Link href={txUrl(event.transactionHash)} className="mono hover:text-primary">
                      {shortenAddress(event.transactionHash, 6)}
                    </Link>
                    <span>{formatDateTime(event.createdAt, language)}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">{t('zone.historyEmpty')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="break-all">{children}</div>
    </div>
  );
}
