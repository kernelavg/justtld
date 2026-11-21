import { ApiError, prepareSubdomainRegistrationSchema } from '@justtld/shared';
import { createIntent } from '@justtld/db';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { buildSubdomainTx, simulateSubdomainCall } from '@/lib/server/tx';
import { chainId, subdomainsAddress, subdomainsEnabled } from '@/lib/server/config';
import { readChainZone } from '@/lib/server/chain';
import { readChainSubdomain } from '@/lib/server/subdomains';

export const dynamic = 'force-dynamic';

/**
 * Готовит неподписанную транзакцию регистрации поддомена.
 * Регистрировать может только владелец зоны — это проверяет и сервер, и контракт.
 */
export const POST = route(
  async (request) => {
    if (!subdomainsEnabled()) {
      throw new ApiError(501, 'SUBDOMAINS_DISABLED', 'Контракт поддоменов не подключён');
    }
    const { tld, label, metadata, sender } = await readJson(
      request,
      prepareSubdomainRegistrationSchema,
    );

    const zone = await readChainZone(tld);
    if (!zone) {
      throw new ApiError(404, 'ZONE_NOT_FOUND', `Зона ${tld} не найдена`);
    }
    if (zone.blocked) {
      throw new ApiError(409, 'ZONE_BLOCKED', 'Зона заблокирована администратором');
    }
    if (zone.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new ApiError(409, 'ZONE_EXPIRED', 'Срок зоны истёк — сначала продлите её');
    }
    if (zone.owner.toLowerCase() !== sender.toLowerCase()) {
      throw new ApiError(403, 'NOT_ZONE_OWNER', 'Поддомены в зоне создаёт только её владелец');
    }
    const existing = await readChainSubdomain(tld, label);
    if (existing && !existing.blocked && existing.expiresAt > Math.floor(Date.now() / 1000)) {
      throw new ApiError(409, 'SUBDOMAIN_TAKEN', `Поддомен ${label}${tld} уже существует`);
    }

    await simulateSubdomainCall({
      functionName: 'registerSubdomain',
      args: [tld, label, metadata],
      account: sender as `0x${string}`,
    });

    const intent = await createIntent({
      action: 'subdomain-register',
      sender,
      tld,
      payload: { label, metadata },
    });

    return jsonResponse(
      {
        tx: buildSubdomainTx({
          functionName: 'registerSubdomain',
          args: [tld, label, metadata],
          sender,
        }),
        intentId: intent.id,
        intentExpiresAt: intent.expiresAt,
        contract: subdomainsAddress(),
        chainId: chainId(),
        tld,
        label,
        name: `${label}.${tld.replace(/^\./, '')}`,
        periodDays: 365,
        warnings: [],
      },
      { status: 201 },
    );
  },
  { limit: 'write', bucket: 'prepare-subdomain-registration' },
);
