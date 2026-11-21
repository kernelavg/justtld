import { ApiError, prepareSubdomainMetadataSchema } from '@justtld/shared';
import { createIntent } from '@justtld/db';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { buildSubdomainTx, simulateSubdomainCall } from '@/lib/server/tx';
import { chainId, subdomainsAddress, subdomainsEnabled } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

/** Неподписанная транзакция обновления метаданных поддомена. */
export const POST = route(
  async (request) => {
    if (!subdomainsEnabled()) {
      throw new ApiError(501, 'SUBDOMAINS_DISABLED', 'Контракт поддоменов не подключён');
    }
    const { tld, label, metadata, sender } = await readJson(
      request,
      prepareSubdomainMetadataSchema,
    );

    await simulateSubdomainCall({
      functionName: 'setSubdomainMetadata',
      args: [tld, label, metadata],
      account: sender as `0x${string}`,
    });

    const intent = await createIntent({
      action: 'subdomain-metadata',
      sender,
      tld,
      payload: { label, metadata },
    });

    return jsonResponse(
      {
        tx: buildSubdomainTx({
          functionName: 'setSubdomainMetadata',
          args: [tld, label, metadata],
          sender,
        }),
        intentId: intent.id,
        intentExpiresAt: intent.expiresAt,
        contract: subdomainsAddress(),
        chainId: chainId(),
      },
      { status: 201 },
    );
  },
  { limit: 'write', bucket: 'prepare-subdomain-metadata' },
);
