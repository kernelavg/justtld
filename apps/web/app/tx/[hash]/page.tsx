'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  createPublicClient,
  http,
  type Hash,
  type Transaction,
  type TransactionReceipt,
} from 'viem';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/primitives';
import { useI18n } from '@/lib/i18n';

const client = createPublicClient({ transport: http('/api/rpc') });

export default function TransactionPage() {
  const params = useParams<{ hash: string }>();
  const hash = params?.hash ?? '';
  const { t } = useI18n();
  const [tx, setTx] = React.useState<Transaction | null>(null);
  const [receipt, setReceipt] = React.useState<TransactionReceipt | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      setError('Некорректный хэш транзакции');
      setLoading(false);
      return;
    }
    Promise.all([
      client.getTransaction({ hash: hash as Hash }),
      client.getTransactionReceipt({ hash: hash as Hash }).catch(() => null),
    ])
      .then(([transaction, rcpt]) => {
        if (cancelled) return;
        setTx(transaction);
        setReceipt(rcpt);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'RPC error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hash]);

  return (
    <div className="container py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t('common.transaction')}</h1>
      <p className="mono mt-1 break-all text-xs text-muted-foreground">{hash}</p>

      {loading ? (
        <Skeleton className="mt-6 h-64 w-full" />
      ) : error ? (
        <Card className="mt-6">
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : tx ? (
        <Card className="mt-6">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Детали транзакции</CardTitle>
            <Badge
              variant={
                receipt?.status === 'success' ? 'success' : receipt ? 'destructive' : 'secondary'
              }
            >
              {receipt ? (receipt.status === 'success' ? 'success' : 'reverted') : 'pending'}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Row label="From">
              <Link className="mono text-xs hover:text-primary" href={`/address/${tx.from}`}>
                {tx.from}
              </Link>
            </Row>
            <Row label="To">
              {tx.to ? (
                <Link className="mono text-xs hover:text-primary" href={`/address/${tx.to}`}>
                  {tx.to}
                </Link>
              ) : (
                'contract creation'
              )}
            </Row>
            <Row label={t('common.block')}>
              {receipt ? (
                <Link className="hover:text-primary" href={`/block/${receipt.blockNumber}`}>
                  #{String(receipt.blockNumber)}
                </Link>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Value">{tx.value.toString()} wei</Row>
            <Row label="Nonce">{tx.nonce}</Row>
            <Row label="Gas price">{tx.gasPrice?.toString() ?? '—'}</Row>
            <Row label={t('tx.gasUsed')}>{receipt?.gasUsed.toString() ?? '—'}</Row>
            <Row label="Input data">
              <span className="mono break-all text-[11px] text-muted-foreground">
                {tx.input.slice(0, 138)}
                {tx.input.length > 138 ? '…' : ''}
              </span>
            </Row>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="break-all text-sm">{children}</div>
    </div>
  );
}
