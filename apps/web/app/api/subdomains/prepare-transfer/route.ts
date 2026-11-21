import { ApiError, prepareSubdomainTransferSchema } from '@justtld/shared';
import { createIntent } from '@justtld/db';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { buildSubdomainTx, simulateSubdomainCall } from '@/lib/server/tx';
import { chainId, subdomainsAddress, subdomainsEnabled } from '@/lib/server/config';
import { readChainSubdomain } from '@/lib/server/subdomains';

export const dynamic = 'force-dynamic';

/** Неподписанная транзакция передачи поддомена (владелец поддомена или зоны). */
export const POST = route(
  async (request) => {
    if (!subdomainsEnabled()) {
      throw new ApiError(501, 'SUBDOMAINS_DISABLED', 'Контракт поддоменов не подключён');
    }
    const { tld, label, to, sender } = await readJson(request, prepareSubdomainTransferSchema);
    const sub = await readChainSubdomain(tld, label);
    if (!sub) throw new ApiError(404, 'SUBDOMAIN_NOT_FOUND', 'Поддомен не найден');

    await simulateSubdomainCall({
      functionName: 'transferSubdomain',
      args: [tld, label, to],
      account: sender as `0x${string}`,
    });

    const intent = await createIntent({
      action: 'subdomain-transfer',
      sender,
      tld,
      payload: { label, to },
    });

    return jsonResponse(
      {
        tx: buildSubdomainTx({ functionName: 'transferSubdomain', args: [tld, label, to], sender }),
        intentId: intent.id,
        intentExpiresAt: intent.expiresAt,
        contract: subdomainsAddress(),
        chainId: chainId(),
      },
      { status: 201 },
    );
  },
  { limit: 'write', bucket: 'prepare-subdomain-transfer' },
);
