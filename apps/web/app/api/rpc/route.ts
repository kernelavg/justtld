import { ApiError } from '@justtld/shared';
import { route } from '@/lib/server/http';
import { rpcUrl } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

/**
 * JSON-RPC прокси к локальному узлу (нужен, когда браузер не имеет прямого доступа к 127.0.0.1:8545,
 * например в preview-окружении). Прокси подписывает НИЧЕГО: сюда попадают уже подписанные raw-транзакции.
 */
const ALLOWED_METHODS = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_call',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_getBalance',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_getTransactionCount',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_getLogs',
  'eth_sendRawTransaction',
  'net_version',
  'web3_clientVersion',
]);

export const POST = route(
  async (request) => {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw ApiError.badRequest('INVALID_JSON', 'Ожидается JSON-RPC запрос');
    }

    const batch = Array.isArray(payload) ? payload : [payload];
    for (const entry of batch) {
      const method = (entry as { method?: string })?.method;
      if (typeof method !== 'string' || !ALLOWED_METHODS.has(method)) {
        throw ApiError.forbidden(`Метод ${String(method)} не разрешён через прокси`);
      }
    }

    const response = await fetch(rpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
  { limit: 'write', bucket: 'rpc-proxy' },
);
