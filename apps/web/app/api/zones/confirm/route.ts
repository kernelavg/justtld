import { ApiError, confirmTxSchema, normalizeTld } from '@justtld/shared';
import { consumeIntent, getZoneByTld, upsertZoneSnapshot, withTransaction } from '@justtld/db';
import { jsonResponse, readJson, readQuery, route } from '@/lib/server/http';
import { getPublicClient, readChainZone } from '@/lib/server/chain';
import { registryAddress } from '@/lib/server/config';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const statusSchema = z.object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

/**
 * Проверяет статус транзакции по чек-рецепту (pending/confirmed/failed)
 * и — при подтверждении — сверяет состояние с контрактом и обновляет кэш.
 * Ничего не «доверяет» клиенту: все данные читаются из блокчейна.
 */
export const POST = route(
  async (request) => {
    const url = new URL(request.url);
    const isStatusOnly = url.searchParams.get('mode') === 'status';

    if (isStatusOnly) {
      const { hash } = readQuery(request, statusSchema);
      return jsonResponse(await check(hash));
    }

    const { transactionHash, intentId } = await readJson(request, confirmTxSchema);
    const result = await check(transactionHash);

    if (intentId && result.status !== 'failed') {
      const sender = typeof result.from === 'string' ? result.from : null;
      if (sender) await consumeIntent(intentId, sender);
    }

    return jsonResponse(result);
  },
  { limit: 'write', bucket: 'confirm' },
);

async function check(hash: string) {
  const client = getPublicClient();
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` });
  } catch {
    return { status: 'pending' as const, transactionHash: hash };
  }

  if (!receipt) return { status: 'pending' as const, transactionHash: hash };

  const tx = await client.getTransaction({ hash: hash as `0x${string}` }).catch(() => null);

  const toContract = receipt.to?.toLowerCase() === registryAddress().toLowerCase();

  if (receipt.status !== 'success') {
    return {
      status: 'failed' as const,
      transactionHash: hash,
      blockNumber: Number(receipt.blockNumber),
      from: tx?.from?.toLowerCase() ?? null,
      reason: 'Транзакция отклонена контрактом (revert)',
    };
  }

  if (!toContract) {
    throw ApiError.badRequest('NOT_REGISTRY_TX', 'Транзакция не относится к контракту реестра');
  }

  // Обновляем кэш из блокчейна (indexer сделает то же самое идемпотентно).
  const zoneTld = await extractTld(tx?.input ?? '0x').catch(() => null);
  if (zoneTld) {
    const chainZone = await readChainZone(zoneTld);
    if (chainZone) {
      await withTransaction(async (db) => {
        await upsertZoneSnapshot(db, {
          tld: normalizeTld(zoneTld),
          ownerAddress: chainZone.owner,
          status: chainZone.blocked
            ? 'blocked'
            : chainZone.expiresAt <= Math.floor(Date.now() / 1000)
              ? 'expired'
              : 'active',
          registeredAt: new Date(chainZone.registeredAt * 1000),
          expiresAt: new Date(chainZone.expiresAt * 1000),
          metadata: chainZone.metadata,
          transactionHash: hash,
          blockNumber: Number(receipt.blockNumber),
        });
      });
    }
  }

  const zone = zoneTld ? await getZoneByTld(normalizeTld(zoneTld)) : null;

  return {
    status: 'confirmed' as const,
    transactionHash: hash,
    blockNumber: Number(receipt.blockNumber),
    blockHash: receipt.blockHash,
    gasUsed: receipt.gasUsed.toString(),
    from: tx?.from?.toLowerCase() ?? null,
    to: receipt.to?.toLowerCase() ?? null,
    tld: zoneTld,
    zone,
  };
}

/** Извлекает TLD из calldata известных функций реестра (для обновления кэша). */
async function extractTld(input: string): Promise<string | null> {
  const { decodeFunctionData } = await import('viem');
  const { REGISTRY_ABI } = await import('@justtld/shared/generated/registry');
  try {
    const decoded = decodeFunctionData({
      abi: REGISTRY_ABI,
      data: input as `0x${string}`,
    });
    const args = decoded.args as readonly unknown[] | undefined;
    const first = args?.[0];
    return typeof first === 'string' ? first : null;
  } catch {
    return null;
  }
}
