import { cancelAuction } from '@justtld/db';
import { ApiError } from '@justtld/shared';
import { requireAdmin } from '@/lib/server/auth';
import { jsonResponse, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const POST = route(
  async (request, context) => {
    await requireAdmin(request);
    const { id } = await (context as { params: Promise<{ id: string }> }).params;
    const cancelled = await cancelAuction(id);
    if (!cancelled) {
      throw ApiError.conflict('CANNOT_CANCEL', 'Аукцион не найден или уже завершён');
    }
    return jsonResponse({ ok: true, auction: cancelled });
  },
  { limit: 'admin', bucket: 'auctions-cancel' },
);
