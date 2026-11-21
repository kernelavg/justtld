'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useApiData } from '@/lib/hooks';
import type { ContractsInfo } from '@/lib/api';

export function SiteFooter() {
  const { t } = useI18n();
  const { data } = useApiData<ContractsInfo>('/api/contracts');

  return (
    <footer className="border-t border-border/50 bg-background">
      <div className="container flex flex-col gap-4 py-8 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src="/brand/icon.png"
            alt="JustTLD"
            width={20}
            height={20}
            className="h-5 w-5 rounded-[5px] ring-1 ring-white/15"
          />
          <span className="font-medium text-foreground">
            Just<span className="brand-text-gradient">TLD</span>
          </span>
          <span className="hidden sm:inline">· {t('app.tagline')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/store" className="transition-colors hover:text-foreground">
            {t('nav.store')}
          </Link>
          <Link href="/register" className="transition-colors hover:text-foreground">
            {t('nav.register')}
          </Link>
          <Link href="/docs" className="transition-colors hover:text-foreground">
            API
          </Link>
          <Link href="/explorer" className="transition-colors hover:text-foreground">
            {t('nav.explorer')}
          </Link>
          <Link href="/admin" className="transition-colors hover:text-foreground">
            {t('nav.admin')}
          </Link>
          {data?.contract ? (
            <span className="mono opacity-70">
              chain {data.chain.id} · {data.contract.address.slice(0, 8)}…
            </span>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
