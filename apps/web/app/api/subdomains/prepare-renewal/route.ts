import { ApiError, prepareSubdomainRenewalSchema } from '@justtld/shared';
import { createIntent } from '@justtld/db';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { buildSubdomainTx, simulateSubdomainCall } from '@/lib/server/tx';
import { chainId, subdomainsAddress, subdomainsEnabled } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

/** Неподписанная транзакция продления поддомена (не дольше срока зоны). */
export const POST = route(
  async (request) => {
    if (!subdomainsEnabled()) {
      throw new ApiError(501, 'SUBDOMAINS_DISABLED', 'Контракт поддоменов не подключён');
    }
    const { tld, label, sender } = await readJson(request, prepareSubdomainRenewalSchema);

    await simulateSubdomainCall({
      functionName: 'renewSubdomain',
      args: [tld, label],
      account: sender as `0x${string}`,
    });

    const intent = await createIntent({
      action: 'subdomain-renew',
      sender,
      tld,
      payload: { label },
    });

    return jsonResponse(
      {
        tx: buildSubdomainTx({ functionName: 'renewSubdomain', args: [tld, label], sender }),
        intentId: intent.id,
        intentExpiresAt: intent.expiresAt,
        contract: subdomainsAddress(),
        chainId: chainId(),
      },
      { status: 201 },
    );
  },
  { limit: 'write', bucket: 'prepare-subdomain-renewal' },
);
