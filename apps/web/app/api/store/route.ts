import {
  getStorePricing,
  listCustodyByOwner,
  listPaymentOrders,
  listStoreListings,
} from '@justtld/db';
import { getSessionFromRequest } from '@/lib/server/auth';
import { cloudflareDnsEnabled } from '@/lib/server/cloudflare-dns';
import { resolverDomain } from '@/lib/server/config';
import { jsonResponse, route } from '@/lib/server/http';
import { paymentGatewaysStatus } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const session = await getSessionFromRequest(request);
    const [listings, pricing] = await Promise.all([
      listStoreListings(true),
      getStorePricing(),
    ]);

    const [myOrders, myCustody] = session
      ? await Promise.all([
          listPaymentOrders({ buyerAddress: session.address, limit: 50 }),
          listCustodyByOwner(session.address),
        ])
      : [[], []];

    const gw = paymentGatewaysStatus();

    return jsonResponse({
      listings,
      pricing,
      gateways: {
        yoomoneyConfigured: gw.yoomoneyConfigured,
        cryptobotConfigured: gw.cryptoBotConfigured,
        cloudflareConfigured: cloudflareDnsEnabled(),
        sandboxEnabled: gw.sandboxEnabled,
      },
      resolverDomain: resolverDomain(),
      myOrders,
      myCustody,
    });
  },
  { limit: 'read', bucket: 'store-catalog' },
);
