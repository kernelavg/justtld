import {
  createAdSlot,
  deleteAdSlot,
  listActiveAdSlots,
  listAllAdSlots,
  toggleAdSlot,
} from '@justtld/db';
import { adminAdSlotSchema, ApiError, type AdPlacement } from '@justtld/shared';
import { getSessionFromRequest, requireAdmin } from '@/lib/server/auth';
import { jsonResponse, readJson, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const url = new URL(request.url);
    const all = url.searchParams.get('all') === '1';
    if (all) {
      const session = await getSessionFromRequest(request);
      if (session?.role === 'admin') {
        return jsonResponse({ ads: await listAllAdSlots() });
      }
    }
    const placementParam = url.searchParams.get('placement');
    const placement =
      placementParam === 'store_top' ||
      placementParam === 'auctions_top' ||
      placementParam === 'footer_sponsor'
        ? (placementParam as AdPlacement)
        : undefined;
    const ads = await listActiveAdSlots(placement);
    return jsonResponse({ ads });
  },
  { limit: 'read', bucket: 'ads-list' },
);

export const POST = route(
  async (request) => {
    const session = await requireAdmin(request);
    const body = await readJson(request, adminAdSlotSchema);
    const ad = await createAdSlot({
      placement: body.placement,
      title: body.title,
      description: body.description,
      ctaLabel: body.ctaLabel,
      targetUrl: body.targetUrl,
      badgeText: body.badgeText,
      ownerAddress: session.address,
      days: body.days,
      isActive: body.isActive,
    });
    return jsonResponse({ ad }, { status: 201 });
  },
  { limit: 'write', bucket: 'ads-admin' },
);

export const PATCH = route(
  async (request) => {
    await requireAdmin(request);
    const body = (await request.json()) as { id?: string; isActive?: boolean };
    if (!body?.id || typeof body.isActive !== 'boolean') {
      throw ApiError.badRequest('INVALID_PARAMS', 'Укажите id и isActive');
    }
    const ad = await toggleAdSlot(body.id, body.isActive);
    if (!ad) throw ApiError.notFound('Рекламный блок не найден');
    return jsonResponse({ ad });
  },
  { limit: 'write', bucket: 'ads-admin' },
);

export const DELETE = route(
  async (request) => {
    await requireAdmin(request);
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) throw ApiError.badRequest('MISSING_ID', 'Укажите id');
    const deleted = await deleteAdSlot(id);
    if (!deleted) throw ApiError.notFound('Рекламный блок не найден');
    return jsonResponse({ deleted: true });
  },
  { limit: 'write', bucket: 'ads-admin' },
);
