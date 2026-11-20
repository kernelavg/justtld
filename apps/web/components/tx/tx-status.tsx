'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/primitives';
import { useI18n } from '@/lib/i18n';
import type { TxFlowState } from '@/lib/hooks';

export function useExplorerUrl() {
  const [template, setTemplate] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/contracts')
      .then((response) => response.json())
      .then((data: { explorer?: { txUrlTemplate?: string | null } }) => {
        if (!cancelled) setTemplate(data.explorer?.txUrlTemplate ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return React.useCallback(
    (hash: string) => (template ? template.replace('{hash}', hash) : `/tx/${hash}`),
    [template],
  );
}

export function TxStatus({ state }: { state: TxFlowState }) {
  const { t } = useI18n();
  const txUrl = useExplorerUrl();

  if (state.phase === 'idle') return null;

  if (state.phase === 'failed') {
    const isRejected =
      state.error === 'REJECTED' || (state.error ?? '').toLowerCase().includes('отклон');
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{t('tx.failedTitle')}</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>{isRejected ? t('error.rejected') : state.error}</p>
          {state.hash && (
            <Link className="inline-flex items-center gap-1 underline" href={txUrl(state.hash)}>
              {t('common.transaction')} {state.hash.slice(0, 12)}…{' '}
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (state.phase === 'confirmed') {
    return (
      <Alert variant="success">
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>{t('tx.confirmedTitle')}</AlertTitle>
        <AlertDescription className="space-y-1">
          {state.result?.blockNumber ? (
            <p>
              {t('common.block')} #{state.result.blockNumber} · gas {state.result.gasUsed}
            </p>
          ) : null}
          {state.hash && (
            <Link className="inline-flex items-center gap-1 underline" href={txUrl(state.hash)}>
              {t('tx.hash')}: {state.hash.slice(0, 14)}… <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const message =
    state.phase === 'preparing'
      ? t('tx.prepare')
      : state.phase === 'signing'
        ? t('tx.signing')
        : t('tx.waiting');

  return (
    <Alert>
      <Loader2 className="h-4 w-4 animate-spin" />
      <AlertTitle>{t('tx.pendingTitle')}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {state.hash && (
          <Link
            className="mono inline-flex items-center gap-1 text-xs underline"
            href={txUrl(state.hash)}
          >
            {state.hash.slice(0, 18)}… <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}
