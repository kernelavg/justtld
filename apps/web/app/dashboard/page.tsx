'use client';

import * as React from 'react';
import Link from 'next/link';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  daysUntil,
  formatDate,
  shortenAddress,
  type Paginated,
  type ZoneDto,
} from '@justtld/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/primitives';
import { ZoneStatusBadge } from '@/components/zones/status-badge';
import { ZoneActions } from '@/components/zones/zone-actions';
import { useI18n } from '@/lib/i18n';
import { useWallet } from '@/lib/wallet';
import { useApiData } from '@/lib/hooks';
import { getSession, signInWithWallet, signOut, type SessionResponse } from '@/lib/api';

export default function DashboardPage() {
  const { t, language } = useI18n();
  const wallet = useWallet();
  const [session, setSession] = React.useState<SessionResponse['session']>(null);
  const [sessionLoading, setSessionLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const zones = useApiData<Paginated<ZoneDto>>(
    wallet.address ? `/api/zones?owner=${wallet.address}&limit=100` : null,
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

  const expiringSoon = (zones.data?.items ?? []).filter(
    (zone) => zone.status === 'active' && daysUntil(zone.expiresAt) <= 30,
  );

  return (
    <div className="container py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {wallet.address ? (
            <Badge variant="outline" className="mono">
              {shortenAddress(wallet.address, 6)}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">{t('dashboard.connectPrompt')}</span>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('dashboard.myZones')}</div>
            <div className="text-2xl font-semibold">{zones.data?.total ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('dashboard.expiringSoon')}</div>
            <div className="text-2xl font-semibold">{expiringSoon.length}</div>
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

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{t('dashboard.myZones')}</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link href="/register">{t('nav.register')}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!wallet.address ? (
            <p className="p-4 text-sm text-muted-foreground">{t('dashboard.connectPrompt')}</p>
          ) : zones.loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-36" />
              ))}
            </div>
          ) : zones.data && zones.data.items.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {zones.data.items.map((zone) => {
                const days = daysUntil(zone.expiresAt);
                return (
                  <div
                    key={zone.id}
                    className="flex flex-col gap-3 rounded-lg border p-4 transition-colors hover:border-primary/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <Link
                          href={`/zone/${zone.tld}`}
                          className="mono block truncate text-lg font-semibold hover:text-primary"
                        >
                          {zone.tld}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {t('common.expires')}: {formatDate(zone.expiresAt, language)}
                        </div>
                      </div>
                      <ZoneStatusBadge status={zone.status} />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="mono" title={zone.ownerAddress}>
                        {shortenAddress(zone.ownerAddress, 5)}
                      </span>
                      <span>·</span>
                      <span>
                        {t('common.daysLeft')}: {days}
                      </span>
                      <span>·</span>
                      <Link
                        href={`/address/${zone.ownerAddress}`}
                        className="hover:text-primary hover:underline"
                      >
                        {t('nav.explorer')}
                      </Link>
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
    </div>
  );
}
