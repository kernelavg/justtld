'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { daysUntil, shortenAddress } from '@justtld/shared';
import { Card, CardContent } from '@/components/ui/card';
import { ZoneStatusBadge } from './status-badge';
import { useI18n } from '@/lib/i18n';
import { formatDate } from '@justtld/shared';
import type { ZoneDto } from '@justtld/shared';

export function ZoneCard({ zone }: { zone: ZoneDto }) {
  const { t, language } = useI18n();
  const days = daysUntil(zone.expiresAt);

  return (
    <Card className="transition-colors hover:border-primary/50">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/zone/${zone.tld}`} className="group flex items-center gap-1">
            <span className="text-lg font-semibold tracking-tight group-hover:text-primary">
              {zone.tld}
            </span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
          <ZoneStatusBadge status={zone.status} />
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>{t('common.owner')}</span>
            <span className="mono text-foreground">{shortenAddress(zone.ownerAddress, 5)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>{t('common.expires')}</span>
            <span className="text-foreground">{formatDate(zone.expiresAt, language)}</span>
          </div>
          {zone.status === 'active' && (
            <div className="flex items-center justify-between gap-2">
              <span>{t('common.daysLeft')}</span>
              <span className="text-foreground">{days}</span>
            </div>
          )}
        </div>

        {zone.metadata ? (
          <p className="mono line-clamp-2 rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
            {zone.metadata}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
