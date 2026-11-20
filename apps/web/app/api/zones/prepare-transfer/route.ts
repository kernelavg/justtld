import { ApiError, prepareTransferSchema } from '@justtld/shared';
import { createIntent, createTransferRequest, getZoneByTld } from '@justtld/db';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { buildUnsignedTx, simulateRegistryCall } from '@/lib/server/tx';
import { readChainZone } from '@/lib/server/chain';
import { chainId, registryAddress } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

/**
 * Готовит транзакцию передачи зоны. Владелец проверяется ДВАЖДЫ:
 * в контракте (источник истины) и по адресу отправителя из запроса.
 */
export const POST = route(
  async (request) => {
    const { tld, to, sender } = await readJson(request, prepareTransferSchema);

    const chainZone = await readChainZone(tld);
    if (!chainZone) throw ApiError.notFound('Зона не найдена в блокчейне');
    if (chainZone.owner !== sender) {
      throw ApiError.forbidden('Передать зону может только её текущий владелец');
    }
    if (chainZone.blocked) {
      throw ApiError.conflict('ZONE_BLOCKED', 'Заблокированную зону нельзя передать');
    }
    if (to === sender) {
      throw ApiError.badRequest('INVALID_RECIPIENT', 'Нельзя передать зону самому себе');
    }

    await simulateRegistryCall({
      functionName: 'transferTLD',
      args: [tld, to],
      account: sender as `0x${string}`,
    });

    const cached = await getZoneByTld(tld);
    const transferRequest = cached
      ? await createTransferRequest({ zoneId: cached.id, fromAddress: sender, toAddress: to })
      : null;
    const intent = await createIntent({ action: 'transfer', sender, tld, payload: { to } });

    return jsonResponse(
      {
        tx: buildUnsignedTx({ functionName: 'transferTLD', args: [tld, to], sender }),
        intentId: intent.id,
        intentExpiresAt: intent.expiresAt,
        transferRequestId: transferRequest?.id ?? null,
        contract: registryAddress(),
        chainId: chainId(),
        tld,
        to,
      },
      { status: 201 },
    );
  },
  { limit: 'write', bucket: 'prepare-transfer' },
);
