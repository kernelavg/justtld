import { z } from 'zod';
import {
  getCustody,
  listCustodySubdomainsByTld,
  listSubdomainsByZone,
  upsertCustody,
} from '@justtld/db';
import { ApiError, subdomainLabelSchema, tldSchema } from '@justtld/shared';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { checkAssetOwnership, requireAssetOwner } from '@/lib/server/ownership';
import { ensureStarterSite } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const url = new URL(request.url);
    const tld = tldSchema.parse(url.searchParams.get('tld') ?? '');
    const [onchain, custodySubs] = await Promise.all([
      listSubdomainsByZone(tld, { page: 1, limit: 200 }),
      listCustodySubdomainsByTld(tld),
    ]);
    return jsonResponse({ tld, onchain: onchain.items, custody: custodySubs });
  },
  { limit: 'read', bucket: 'sites-subdomains-list' },
);

const createCustodySubdomainSchema = z.object({
  tld: tldSchema,
  label: subdomainLabelSchema,
  withStarterSite: z.boolean().optional().default(true),
});

export const POST = route(
  async (request) => {
    const body = await readJson(request, createCustodySubdomainSchema);
    const { session, ownership } = await requireAssetOwner(request, body.tld, '');

    const ownerAddress = ownership.assetOwner ?? session.address;
    const existing = await checkAssetOwnership(body.tld, body.label, session.address);
    if (
      existing.exists &&
      existing.assetOwner &&
      existing.assetOwner.toLowerCase() !== ownerAddress.toLowerCase()
    ) {
      throw ApiError.conflict('SUBDOMAIN_TAKEN', `Поддомен ${body.label}${body.tld} уже занят`);
    }

    const parentCustody = await getCustody(body.tld, '');
    const periodDays = parentCustody
      ? Math.max(
          1,
          Math.ceil((new Date(parentCustody.expiresAt).getTime() - Date.now()) / 86_400_000),
        )
      : 365;

    const custody = await upsertCustody({
      tld: body.tld,
      subLabel: body.label,
      ownerAddress,
      source: 'admin',
      periodDays,
    });

    if (body.withStarterSite) {
      await ensureStarterSite(body.tld, body.label, ownerAddress);
    }

    return jsonResponse({ ok: true, custody }, { status: 201 });
  },
  { limit: 'write', bucket: 'sites-subdomains-create' },
);
