import { ApiError, prepareRenewalSchema } from '@justtld/shared';
import { createIntent } from '@justtld/db';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { buildUnsignedTx, simulateRegistryCall } from '@/lib/server/tx';
import { readChainZone } from '@/lib/server/chain';
import { chainId, registryAddress } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request) => {
    const { tld, sender } = await readJson(request, prepareRenewalSchema);

    const chainZone = await readChainZone(tld);
    if (!chainZone) throw ApiError.notFound('Зона не найдена в блокчейне');
    if (chainZone.owner !== sender) {
      throw ApiError.forbidden('Продлить зону может только её владелец');
    }
    if (chainZone.blocked) {
      throw ApiError.conflict('ZONE_BLOCKED', 'Заблокированную зону нельзя продлить');
    }

    await simulateRegistryCall({
      functionName: 'renewTLD',
      args: [tld],
      account: sender as `0x${string}`,
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const base = chainZone.expiresAt > nowSeconds ? chainZone.expiresAt : nowSeconds;
    const newExpiresAt = new Date((base + 365 * 24 * 60 * 60) * 1000).toISOString();
    const intent = await createIntent({ action: 'renew', sender, tld });

    return jsonResponse(
      {
        tx: buildUnsignedTx({ functionName: 'renewTLD', args: [tld], sender }),
        intentId: intent.id,
        intentExpiresAt: intent.expiresAt,
        newExpiresAt,
        contract: registryAddress(),
        chainId: chainId(),
        tld,
      },
      { status: 201 },
    );
  },
  { limit: 'write', bucket: 'prepare-renewal' },
);
