import { getCheckpoint } from '@justtld/db';
import { jsonResponse, route } from '@/lib/server/http';
import { requireAdmin } from '@/lib/server/auth';
import { getAdminLists, getRegistryOwner, isPaused } from '@/lib/server/chain';
import { adminAddress, chainId } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const session = await requireAdmin(request);
    const [lists, owner, paused, checkpoint] = await Promise.all([
      getAdminLists(),
      getRegistryOwner(),
      isPaused(),
      getCheckpoint().catch(() => null),
    ]);
    return jsonResponse({
      session,
      adminAddress: adminAddress(),
      chainId: chainId(),
      contractOwner: owner,
      paused,
      reserved: lists.reserved,
      blacklist: lists.blacklist,
      indexer: {
        lastIndexedBlock: checkpoint?.lastBlock ?? 0,
        updatedAt: checkpoint?.updatedAt ?? null,
      },
    });
  },
  { limit: 'admin', bucket: 'admin-lists' },
);
