'use client';

import * as React from 'react';
import { apiFetch, ApiClientError, type ConfirmResponse } from './api';
import { useWallet } from './wallet';
import type { UnsignedTx } from '@justtld/shared';

/** Простой загрузчик данных с отменой и ручным reload. */
export function useApiData<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(Boolean(url));
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<T>(url)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Ошибка запроса');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, nonce, ...deps]);

  const reload = React.useCallback(() => setNonce((value) => value + 1), []);
  return { data, error, loading, reload };
}

export type TxPhase = 'idle' | 'preparing' | 'signing' | 'pending' | 'confirmed' | 'failed';

export type TxFlowState = {
  phase: TxPhase;
  hash: string | null;
  error: string | null;
  result: ConfirmResponse | null;
};

const INITIAL_STATE: TxFlowState = { phase: 'idle', hash: null, error: null, result: null };

function humanizeError(error: unknown, rejectedMessage: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes('User rejected') ||
    message.includes('user rejected') ||
    message.includes('4001') ||
    message.includes('rejected the request')
  ) {
    return rejectedMessage;
  }
  if (message.includes('insufficient funds')) return 'INSUFFICIENT_FUNDS';
  if (error instanceof ApiClientError) return error.message;
  return message.split('\n')[0] ?? message;
}

/**
 * Полный цикл подписи транзакции:
 * подготовка на сервере → подпись в кошельке → ожидание блока → сверка с контрактом.
 */
export function useTxFlow() {
  const { sendTransaction } = useWallet();
  const [state, setState] = React.useState<TxFlowState>(INITIAL_STATE);

  const reset = React.useCallback(() => setState(INITIAL_STATE), []);

  const run = React.useCallback(
    async (
      prepare: () => Promise<{ tx: UnsignedTx; intentId?: string }>,
      options: {
        rejectedMessage: string;
        confirm?: (hash: string, intentId?: string) => Promise<ConfirmResponse>;
      },
    ): Promise<ConfirmResponse | null> => {
      setState({ phase: 'preparing', hash: null, error: null, result: null });
      try {
        const prepared = await prepare();
        setState({ phase: 'signing', hash: null, error: null, result: null });
        const hash = await sendTransaction(prepared.tx);
        setState({ phase: 'pending', hash, error: null, result: null });

        const confirm = options.confirm ?? (await import('./api')).confirmTx;

        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline) {
          const result = await confirm(hash, prepared.intentId);
          if (result.status === 'confirmed') {
            setState({ phase: 'confirmed', hash, error: null, result });
            return result;
          }
          if (result.status === 'failed') {
            setState({ phase: 'failed', hash, error: result.reason ?? 'REVERTED', result });
            return result;
          }
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
        setState({
          phase: 'failed',
          hash,
          error: 'TIMEOUT',
          result: null,
        });
        return null;
      } catch (error) {
        const message = humanizeError(error, options.rejectedMessage);
        setState({ phase: 'failed', hash: null, error: message, result: null });
        return null;
      }
    },
    [sendTransaction],
  );

  return { state, run, reset };
}
