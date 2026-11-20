'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/primitives';
import { useI18n } from '@/lib/i18n';
import { useApiData } from '@/lib/hooks';
import type { ContractsInfo } from '@/lib/api';
import { createPublicClient, http } from 'viem';

const client = createPublicClient({ transport: http('/api/rpc') });

type BlockRow = { number: number; hash: string; transactions: number; timestamp: number };

export default function ExplorerPage() {
  const { t } = useI18n();
  const router = useRouter();
  const contracts = useApiData<ContractsInfo>('/api/contracts');
  const [blocks, setBlocks] = React.useState<BlockRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    client
      .getBlockNumber()
      .then(async (head) => {
        const numbers = Array.from({ length: 10 }, (_, index) => Number(head) - index).filter(
          (n) => n >= 0,
        );
        const rows = await Promise.all(
          numbers.map(async (number) => {
            const block = await client.getBlock({ blockNumber: BigInt(number) });
            return {
              number: Number(block.number),
              hash: block.hash ?? '',
              transactions: block.transactions.length,
              timestamp: Number(block.timestamp),
            };
          }),
        );
        if (!cancelled) setBlocks(rows);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'RPC error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const go = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    if (/^\d+$/.test(value)) router.push(`/block/${value}`);
    else if (/^0x[0-9a-fA-F]{64}$/.test(value)) router.push(`/tx/${value}`);
    else if (/^0x[0-9a-fA-F]{40}$/.test(value)) router.push(`/address/${value}`);
    else router.push(`/zone/${encodeURIComponent(value.startsWith('.') ? value : `.${value}`)}`);
  };

  return (
    <div className="container py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t('nav.explorer')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Обозреватель читает данные напрямую из локального узла через JSON-RPC (
        {contracts.data?.chain.rpcUrl}).
      </p>

      <form onSubmit={go} className="mt-5 flex max-w-xl gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="0x… tx hash / адрес / номер блока / .zone"
          className="mono"
        />
        <Button type="submit">
          <Search className="h-4 w-4" />
        </Button>
      </form>

      {contracts.data?.contract && (
        <Card className="mt-5 max-w-xl">
          <CardContent className="space-y-1 p-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">JustTLDRegistry</span>
              <Link
                href={`/address/${contracts.data.contract.address}`}
                className="mono hover:text-primary"
              >
                {contracts.data.contract.address}
              </Link>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">chainId</span>
              <span className="mono">{contracts.data.chain.id}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">owner</span>
              <span className="mono text-xs">{contracts.data.contract.owner}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Последние блоки</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !blocks ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <div className="divide-y text-sm">
              {blocks.map((block) => (
                <div key={block.number} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/block/${block.number}`} className="font-medium hover:text-primary">
                    #{block.number}
                  </Link>
                  <span className="mono text-xs text-muted-foreground">
                    {block.hash.slice(0, 18)}…
                  </span>
                  <span className="text-xs text-muted-foreground">{block.transactions} tx</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
