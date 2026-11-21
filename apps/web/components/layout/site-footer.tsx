'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useApiData } from '@/lib/hooks';
import type { ContractsInfo } from '@/lib/api';

export function SiteFooter() {
  const { t } = useI18n();
  const { data } = useApiData<ContractsInfo>('/api/contracts');

  return (
    <footer className="border-t border-border/60 bg-card/30 backdrop-blur-sm">
      <div className="container flex flex-col gap-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/brand/icon.png"
            alt="JustTLD"
            width={28}
            height={28}
            className="h-7 w-7 rounded-lg ring-1 ring-white/10"
          />
          <div>
            <div className="font-semibold text-foreground">
              Just<span className="brand-text-gradient">TLD</span>
            </div>
            <div className="text-xs">{t('app.tagline')}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/store" className="transition-colors hover:text-foreground">
            {t('nav.store')}
          </Link>
          <Link href="/docs" className="transition-colors hover:text-foreground">
            API / Docs
          </Link>
          <Link href="/explorer" className="transition-colors hover:text-foreground">
            {t('nav.explorer')}
          </Link>
          <span className="mono rounded-md border border-border/60 bg-secondary/50 px-2 py-0.5 text-xs">
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
