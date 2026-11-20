'use client';

import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n';
import type { ZoneStatus } from '@justtld/shared';

export function ZoneStatusBadge({ status }: { status: ZoneStatus }) {
  const { t } = useI18n();
  if (status === 'active') return <Badge variant="success">{t('common.active')}</Badge>;
  if (status === 'expired') return <Badge variant="warning">{t('common.expired')}</Badge>;
  return <Badge variant="destructive">{t('common.blocked')}</Badge>;
}
