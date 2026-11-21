'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Clock, KeyRound, Layers, LogOut, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  daysUntil,
  formatDate,
  shortenAddress,
  type Paginated,
  type SubdomainDto,
  type ZoneDto,
} from '@justtld/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { ZoneStatusBadge } from '@/components/zones/status-badge';
import { ZoneActions } from '@/components/zones/zone-actions';
import { useI18n } from '@/lib/i18n';
import { useWallet } from '@/lib/wallet';
import { useApiData } from '@/lib/hooks';
import { getSession, signInWithWallet, signOut, type SessionResponse } from '@/lib/api';
import { buildResolverLinks, parseZoneMetadata } from '@/lib/metadata';
import { CopyUrlButton, useResolverDomain } from '@/components/zones/resolver-links';

export default function DashboardPage() {
  const { t, language } = useI18n();
  const wallet = useWallet();
  const resolverDomain = useResolverDomain();
  const [session, setSession] = React.useState<SessionResponse['session']>(null);
  const [sessionLoading, setSessionLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const zones = useApiData<Paginated<ZoneDto>>(
    wallet.address ? `/api/zones?owner=${wallet.address}&limit=100` : null,
    [wallet.address],
  );
  const subdomains = useApiData<Paginated<SubdomainDto>>(
    wallet.address ? `/api/subdomains?owner=${wallet.address}&limit=100` : null,
    [wallet.address],
  );

  const loadSession = React.useCallback(() => {
    setSessionLoading(true);
    getSession()
      .then((result) => setSession(result.session))
      .catch(() => setSession(null))
      .finally(() => setSessionLoading(false));
  }, []);

  React.useEffect(loadSession, [loadSession]);

  const signIn = async () => {
    if (!wallet.address) {
      toast.error(t('register.connectFirst'));
      return;
    }
    setBusy(true);
    try {
      const user = await signInWithWallet(wallet.address, wallet.signMessage);
      setSession(user);
      toast.success(t('dashboard.signedIn'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error.unknown'));
    } finally {
      setBusy(false);
    }
  };

  const doSignOut = async () => {
    await signOut().catch(() => undefined);
    setSession(null);
    toast.success(t('dashboard.signOut'));
  };

  const zoneItems = zones.data?.items ?? [];
  const subItems = subdomains.data?.items ?? [];
  const expiringSoon = zoneItems.filter(
    (zone) => zone.status === 'active' && daysUntil(zone.expiresAt) <= 30,
  );

  return (
    <div className="container py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('dashboard.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {wallet.address ? (
            <Badge variant="outline" className="mono px-3 py-1">
              {shortenAddress(wallet.address, 6)}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">{t('dashboard.connectPrompt')}</span>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('dashboard.myZones')}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {zones.data?.total ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('dashboard.mySubdomains')}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {subdomains.data?.total ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('dashboard.expiringSoon')}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{expiringSoon.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="text-xs text-muted-foreground">{t('dashboard.session')}</div>
            {sessionLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : session ? (
              <div className="flex items-center gap-2">
                <Badge variant={session.role === 'admin' ? 'default' : 'success'}>
                  {session.role}
                </Badge>
                <span className="mono text-xs">{shortenAddress(session.address, 4)}</span>
                <Button size="sm" variant="ghost" onClick={doSignOut}>
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={signIn} disabled={busy || !wallet.address}>
                <KeyRound className="h-3.5 w-3.5" /> {t('dashboard.signIn')}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {!session && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> {t('dashboard.signInHint')}
        </p>
      )}

      <Tabs defaultValue="zones" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="zones">
              {t('dashboard.myZones')} ({zones.data?.total ?? 0})
            </TabsTrigger>
            <TabsTrigger value="subdomains" className="gap-1.5">
              <Layers className="h-3.5 w-3.5" /> {t('dashboard.mySubdomains')} (
              {subdomains.data?.total ?? 0})
            </TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/subdomains">
                <Layers className="h-3.5 w-3.5" /> {t('nav.subdomains')}
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">
                <Plus className="h-3.5 w-3.5" /> {t('nav.register')}
              </Link>
            </Button>
          </div>
        </div>

        <TabsContent value="zones">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dashboard.myZones')}</CardTitle>
            </CardHeader>
            <CardContent>
              {!wallet.address ? (
                <p className="p-4 text-sm text-muted-foreground">{t('dashboard.connectPrompt')}</p>
              ) : zones.loading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-40" />
                  ))}
                </div>
              ) : zoneItems.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {zoneItems.map((zone) => {
                    const days = daysUntil(zone.expiresAt);
                    const parsed = parseZoneMetadata(zone.metadata);
                    const resolverUrl = buildResolverLinks({
                      tld: zone.tld,
                      baseDomain: resolverDomain,
                    })[0]?.url;
                    const zoneSubsCount = subItems.filter((s) => s.tld === zone.tld).length;
                    const graceEnd = new Date(
                      new Date(zone.expiresAt).getTime() + 30 * 86_400_000,
                    ).toISOString();

                    return (
                      <div
                        key={zone.id}
                        className="flex flex-col gap-3 rounded-xl border bg-card/60 p-4 transition-colors hover:border-primary/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <Link
                              href={`/zone/${zone.tld}`}
                              className="mono block truncate text-lg font-semibold hover:text-primary"
                            >
                              {zone.tld}
                            </Link>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>
                                {zone.status === 'active'
                                  ? `до ${formatDate(zone.expiresAt, language)} (${days} дн.)`
                                  : `Grace до ${formatDate(graceEnd, language)}`}
                              </span>
                            </div>
                          </div>
                          <ZoneStatusBadge status={zone.status} />
                        </div>

                        {parsed.url ? (
                          <div className="truncate rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
                            <span className="text-muted-foreground">→ </span>
                            <a
                              href={parsed.url}
                              target="_blank"
                              rel="noreferrer"
                              className="mono text-primary hover:underline"
                            >
                              {parsed.url}
                            </a>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Link
                            href={`/zone/${zone.tld}?tab=subdomains`}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          >
                            <Layers className="h-3 w-3" /> Поддомены ({zoneSubsCount})
                          </Link>
                          {resolverUrl ? (
                            <a
                              href={resolverUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            >
                              Резолвер <ArrowUpRight className="h-3 w-3" />
                            </a>
                          ) : null}
                        </div>

                        <div className="mt-auto pt-1">
                          <ZoneActions zone={zone} compact onChanged={zones.reload} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3 p-4 text-center">
                  <p className="text-sm text-muted-foreground">{t('dashboard.empty')}</p>
                  <Button asChild size="sm">
                    <Link href="/register">{t('dashboard.registerFirst')}</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subdomains">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">{t('dashboard.mySubdomains')}</CardTitle>
              <Button asChild size="sm" variant="outline">
                <Link href="/subdomains">Открыть каталог поддоменов</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {!wallet.address ? (
                <p className="p-4 text-sm text-muted-foreground">{t('dashboard.connectPrompt')}</p>
              ) : subdomains.loading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-28" />
                  ))}
                </div>
              ) : subItems.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {subItems.map((sub) => {
                    const days = daysUntil(sub.expiresAt);
                    const parsed = parseZoneMetadata(sub.metadata);
                    const primaryUrl =
                      buildResolverLinks({
                        tld: sub.tld,
                        label: sub.label,
                        baseDomain: resolverDomain,
                      })[0]?.url ?? '';
                    return (
                      <div
                        key={sub.id}
                        className="flex flex-col gap-2.5 rounded-xl border bg-card/60 p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="mono block truncate text-base font-semibold">
                              {sub.name}
                            </span>
                            <Link
                              href={`/zone/${sub.tld}?tab=subdomains`}
                              className="mono text-xs text-muted-foreground hover:text-primary"
                            >
                              управлять в {sub.tld} →
                            </Link>
                          </div>
                          <Badge variant={sub.status === 'active' ? 'success' : 'secondary'}>
                            {sub.status === 'active' ? `${days} дн.` : sub.status}
                          </Badge>
                        </div>

                        {parsed.url ? (
                          <p className="mono truncate text-xs text-primary">→ {parsed.url}</p>
                        ) : null}

                        {primaryUrl ? (
                          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                            <CopyUrlButton url={primaryUrl} label="Копировать URL" />
                            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                              <a href={primaryUrl} target="_blank" rel="noreferrer">
                                Открыть <ArrowUpRight className="h-3 w-3" />
                              </a>
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3 p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    У вас пока нет поддоменов. Создайте их во вкладке «Поддомены» или внутри любой
                    вашей зоны.
                  </p>
                  <Button asChild size="sm">
                    <Link href="/subdomains">Перейти к поддоменам</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
