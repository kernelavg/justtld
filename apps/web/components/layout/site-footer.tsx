'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useApiData } from '@/lib/hooks';
import type { ContractsInfo } from '@/lib/api';

export function SiteFooter() {
  const { t } = useI18n();
  const { data } = useApiData<ContractsInfo>('/api/contracts');

  return (
    <footer className="border-t bg-card/40">
      <div className="container flex flex-col gap-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="font-semibold text-foreground">JustTLD</div>
          <div>{t('app.tagline')}</div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/docs" className="hover:text-foreground">
            API / Docs
          </Link>
          <Link href="/explorer" className="hover:text-foreground">
            {t('nav.explorer')}
          </Link>
          <span className="mono text-xs">
            chain {data?.chain.id ?? 31337}
            {data?.contract
              ? ` · ${data.contract.address.slice(0, 10)}…`
              : ' · контракт не развёрнут'}
          </span>
        </div>
      </div>
    </footer>
  );
}
