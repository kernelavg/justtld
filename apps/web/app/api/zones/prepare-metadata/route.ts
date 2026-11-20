import { ApiError, prepareMetadataSchema } from '@justtld/shared';
import { createIntent } from '@justtld/db';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { buildUnsignedTx, simulateRegistryCall } from '@/lib/server/tx';
import { readChainZone } from '@/lib/server/chain';
import { chainId, registryAddress } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request) => {
    const { tld, metadata, sender } = await readJson(request, prepareMetadataSchema);

    const chainZone = await readChainZone(tld);
    if (!chainZone) throw ApiError.notFound('Зона не найдена в блокчейне');
    if (chainZone.owner !== sender) {
      throw ApiError.forbidden('Метаданные может менять только владелец зоны');
    }
    if (chainZone.blocked) {
      throw ApiError.conflict('ZONE_BLOCKED', 'Заблокированную зону нельзя изменить');
    }

    await simulateRegistryCall({
      functionName: 'setTLDMetadata',
      args: [tld, metadata],
      account: sender as `0x${string}`,
    });

    const intent = await createIntent({ action: 'metadata', sender, tld, payload: { metadata } });

    return jsonResponse(
      {
        tx: buildUnsignedTx({ functionName: 'setTLDMetadata', args: [tld, metadata], sender }),
        intentId: intent.id,
        intentExpiresAt: intent.expiresAt,
        contract: registryAddress(),
        chainId: chainId(),
        tld,
      },
      { status: 201 },
    );
  },
  { limit: 'write', bucket: 'prepare-metadata' },
);
