'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createPublicClient, http } from 'viem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/primitives';
import { formatDateTime } from '@justtld/shared';
import { useI18n } from '@/lib/i18n';

const client = createPublicClient({ transport: http('/api/rpc') });

type BlockInfo = {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  gasUsed: bigint;
  gasLimit: bigint;
  transactions: string[];
};

export default function BlockPage() {
  const params = useParams<{ number: string }>();
  const blockNumber = Number(params?.number ?? 0);
  const { language } = useI18n();
  const [block, setBlock] = React.useState<BlockInfo | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    if (!Number.isFinite(blockNumber) || blockNumber < 0) {
      setError('Некорректный номер блока');
      setLoading(false);
      return;
    }
    client
      .getBlock({ blockNumber: BigInt(blockNumber), includeTransactions: false })
      .then((result) => {
        if (cancelled) return;
        setBlock({
          number: Number(result.number),
          hash: result.hash ?? '',
          parentHash: result.parentHash,
          timestamp: Number(result.timestamp),
          gasUsed: result.gasUsed,
          gasLimit: result.gasLimit,
          transactions: result.transactions as string[],
        });
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
  }, [blockNumber]);

  return (
    <div className="container py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Блок #{blockNumber}</h1>
      {loading ? (
        <Skeleton className="mt-6 h-56 w-full" />
      ) : error ? (
        <Card className="mt-6">
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : block ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Данные блока</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Hash">
              <span className="mono text-xs">{block.hash}</span>
            </Row>
            <Row label="Parent">
              <span className="mono text-xs">{block.parentHash}</span>
            </Row>
            <Row label="Timestamp">{formatDateTime(block.timestamp, language)}</Row>
            <Row label="Gas">
              {block.gasUsed.toString()} / {block.gasLimit.toString()}
            </Row>
            <Row label={`Транзакции (${block.transactions.length})`}>
              <ul className="space-y-1">
                {block.transactions.map((hash) => (
                  <li key={hash}>
                    <Link href={`/tx/${hash}`} className="mono text-xs hover:text-primary">
                      {hash}
                    </Link>
                  </li>
                ))}
              </ul>
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
      <div className="break-all">{children}</div>
    </div>
  );
}
