'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { createPublicClient, formatEther, http } from 'viem';
import type { Paginated, ZoneDto } from '@justtld/shared';
import { shortenAddress } from '@justtld/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/primitives';
import { ZoneCard } from '@/components/zones/zone-card';
import { useI18n } from '@/lib/i18n';
import { useApiData } from '@/lib/hooks';

const client = createPublicClient({ transport: http('/api/rpc') });

export default function AddressPage() {
  const params = useParams<{ address: string }>();
  const address = params?.address ?? '';
  const { t } = useI18n();
  const [balance, setBalance] = React.useState<string | null>(null);
  const zones = useApiData<Paginated<ZoneDto>>(
    /^0x[0-9a-fA-F]{40}$/.test(address) ? `/api/zones?owner=${address}&limit=50` : null,
    [address],
  );

  React.useEffect(() => {
    let cancelled = false;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return;
    client
      .getBalance({ address: address as `0x${string}` })
      .then((value) => {
        if (!cancelled) setBalance(`${Number(formatEther(value)).toFixed(4)} ETH`);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [address]);

  return (
    <div className="container py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Адрес</h1>
      <p className="mono mt-1 break-all text-xs text-muted-foreground">{address}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Баланс</div>
            <div className="text-lg font-semibold">{balance ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('dashboard.myZones')}</div>
            <div className="text-lg font-semibold">{zones.data?.total ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('common.address')}</div>
            <div className="mono text-sm">{shortenAddress(address, 8)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-base">{t('common.zones')}</CardTitle>
        </CardHeader>
        <CardContent>
          {zones.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : zones.data && zones.data.items.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {zones.data.items.map((zone) => (
                <ZoneCard key={zone.id} zone={zone} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('common.empty')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
