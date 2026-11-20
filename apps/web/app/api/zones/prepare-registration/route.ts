import {
  ApiError,
  TLD_ISSUE_MESSAGES,
  prepareRegistrationSchema,
  type TldIssueCode,
} from '@justtld/shared';
import { createIntent } from '@justtld/db';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { buildUnsignedTx, simulateRegistryCall } from '@/lib/server/tx';
import { checkRegistrationOnChain } from '@/lib/server/chain';
import { chainId, registryAddress } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

/**
 * Готовит НЕПОДПИСАННУЮ транзакцию регистрации.
 * Сервер проверяет состояние контракта и симулирует вызов, но подписывает только кошелёк.
 */
export const POST = route(
  async (request) => {
    const { tld, metadata, sender } = await readJson(request, prepareRegistrationSchema);

    const onChain = await checkRegistrationOnChain(tld);
    if (!onChain.ok) {
      const code = onChain.reason as TldIssueCode;
      const message = TLD_ISSUE_MESSAGES[code]?.ru ?? `Регистрация невозможна: ${onChain.reason}`;
      throw new ApiError(
        onChain.reason === 'TLD_ALREADY_EXISTS' ? 409 : 400,
        onChain.reason || 'REGISTRATION_UNAVAILABLE',
        message,
      );
    }

    await simulateRegistryCall({
      functionName: 'registerTLD',
      args: [tld, metadata],
      account: sender as `0x${string}`,
    });

    const intent = await createIntent({ action: 'register', sender, tld, payload: { metadata } });

    return jsonResponse(
      {
        tx: buildUnsignedTx({ functionName: 'registerTLD', args: [tld, metadata], sender }),
        intentId: intent.id,
        intentExpiresAt: intent.expiresAt,
        contract: registryAddress(),
        chainId: chainId(),
        tld,
        periodDays: 365,
        warnings: [],
      },
      { status: 201 },
    );
  },
  { limit: 'write', bucket: 'prepare-registration' },
);
