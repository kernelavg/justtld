import { z } from 'zod';
import {
  deleteStoreListing,
  getAccountByEmail,
  getCustody,
  getStorePricing,
  listAllCustody,
  listPaymentOrders,
  listStoreListings,
  saveStorePricing,
  upsertCustody,
  upsertStoreListing,
} from '@justtld/db';
import {
  addressSchema,
  ApiError,
  optionalSubLabelSchema,
  storeListingCreateSchema,
  storePricingSchema,
  tldSchema,
} from '@justtld/shared';
import { requireAdmin } from '@/lib/server/auth';
import { cloudflareDnsEnabled } from '@/lib/server/cloudflare-dns';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import {
  ensureStarterSite,
  fulfillPaymentOrder,
  paymentGatewaysStatus,
} from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

const adminActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('upsert_listing'),
    listing: storeListingCreateSchema.extend({ id: z.string().uuid().optional() }),
  }),
  z.object({
    action: z.literal('update_pricing'),
    pricing: storePricingSchema,
  }),
  z.object({
    action: z.literal('confirm_order'),
    orderId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('grant_zone'),
    tld: tldSchema,
    subLabel: optionalSubLabelSchema,
    owner: z.string().trim().min(3),
    periodDays: z.coerce.number().int().min(1).max(3650).default(365),
  }),
]);

export const GET = route(
  async (request) => {
    await requireAdmin(request);
    const [listings, pricing, orders, custody] = await Promise.all([
      listStoreListings(false),
      getStorePricing(),
      listPaymentOrders({ limit: 100 }),
      listAllCustody(200),
    ]);
    const gw = paymentGatewaysStatus();
    return jsonResponse({
      listings,
      pricing,
      orders,
      custody,
      gateways: {
        yoomoneyConfigured: gw.yoomoneyConfigured,
        cryptobotConfigured: gw.cryptoBotConfigured,
        cloudflareConfigured: cloudflareDnsEnabled(),
        sandboxEnabled: gw.sandboxEnabled,
      },
    });
  },
  { limit: 'admin', bucket: 'admin-store-read' },
);

export const POST = route(
  async (request) => {
    await requireAdmin(request);
    const body = await readJson(request, adminActionSchema);

    if (body.action === 'upsert_listing') {
      const listing = await upsertStoreListing(body.listing);
      return jsonResponse({ ok: true, listing });
    }

    if (body.action === 'update_pricing') {
      const pricing = await saveStorePricing(body.pricing);
      return jsonResponse({ ok: true, pricing });
    }

    if (body.action === 'confirm_order') {
      const order = await fulfillPaymentOrder(body.orderId, { externalId: 'admin-manual' });
      const custody = await getCustody(order.tld, order.subLabel);
      return jsonResponse({ ok: true, order, custody });
    }

    let ownerAddress = body.owner.toLowerCase();
    if (body.owner.includes('@')) {
      const account = await getAccountByEmail(body.owner);
      if (!account) {
        throw ApiError.notFound(`Аккаунт с email ${body.owner} не найден`);
      }
      ownerAddress = account.walletAddress;
    } else {
      const parsed = addressSchema.safeParse(body.owner);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'INVALID_OWNER',
          'Укажите корректный 0x-адрес кошелька или email зарегистрированного пользователя',
        );
      }
      ownerAddress = parsed.data;
    }

    const custody = await upsertCustody({
      tld: body.tld,
      subLabel: body.subLabel,
      ownerAddress,
      source: 'admin',
      periodDays: body.periodDays,
    });
    await ensureStarterSite(body.tld, body.subLabel, ownerAddress);

    return jsonResponse({ ok: true, custody }, { status: 201 });
  },
  { limit: 'admin', bucket: 'admin-store-write' },
);

export const DELETE = route(
  async (request) => {
    await requireAdmin(request);
    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.trim();
    if (!id) throw ApiError.badRequest('MISSING_ID', 'Укажите id лота');
    await deleteStoreListing(id);
    return jsonResponse({ ok: true });
  },
  { limit: 'admin', bucket: 'admin-store-delete' },
);
