import { getCheckpoint, getStats, refreshExpiredStatuses } from '@justtld/db';
import { jsonResponse, route } from '@/lib/server/http';
import { getChainHead } from '@/lib/server/chain';
import { registryAddress } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

export const GET = route(
  async () => {
    await refreshExpiredStatuses().catch(() => 0);
    const [checkpoint, head] = await Promise.all([
      getCheckpoint().catch(() => null),
      getChainHead().catch(() => 0),
    ]);
    const stats = await getStats(head, checkpoint?.lastBlock ?? 0);
    // Адрес контракта берём из конфигурации деплоя — клиенту нужен он же для ссылок и подписи.
    return jsonResponse({ ...stats, contractAddress: registryAddress() });
  },
  { limit: 'read', bucket: 'stats' },
);
