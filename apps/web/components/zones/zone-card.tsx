'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { daysUntil, formatDate, shortenAddress } from '@justtld/shared';
import { Card, CardContent } from '@/components/ui/card';
import { ZoneStatusBadge } from './status-badge';
import { useI18n } from '@/lib/i18n';
import { parseZoneMetadata } from '@/lib/metadata';
import type { ZoneDto } from '@justtld/shared';

export function ZoneCard({ zone }: { zone: ZoneDto }) {
  const { t, language } = useI18n();
  const days = daysUntil(zone.expiresAt);
  const meta = parseZoneMetadata(zone.metadata);
  const previewText =
    meta.url || meta.title || meta.description || (!meta.isJson && meta.raw ? meta.raw : null);

  return (
    <Card className="card-hover">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/zone/${zone.tld}`} className="group flex items-center gap-1">
            <span className="text-base font-semibold tracking-tight group-hover:text-primary">
              {zone.tld}
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
          <ZoneStatusBadge status={zone.status} />
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>{t('common.owner')}</span>
            <span className="mono text-foreground/90">{shortenAddress(zone.ownerAddress, 5)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>{t('common.expires')}</span>
            <span className="text-foreground/90">{formatDate(zone.expiresAt, language)}</span>
          </div>
          {zone.status === 'active' && (
            <div className="flex items-center justify-between gap-2">
              <span>{t('common.daysLeft')}</span>
              <span className="text-foreground/90">{days}</span>
            </div>
          )}
        </div>

        {previewText ? (
          <p className="truncate rounded-md bg-secondary/60 px-2.5 py-1 text-[11px] text-muted-foreground">
            {previewText}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
