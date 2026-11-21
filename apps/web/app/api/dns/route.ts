import {
  deleteDnsRecordById,
  getDnsRecordById,
  insertDnsRecord,
  listDnsRecords,
} from '@justtld/db';
import {
  ApiError,
  dnsRecordCreateSchema,
  optionalSubLabelSchema,
  tldSchema,
} from '@justtld/shared';
import {
  buildSafeFqdn,
  cloudflareDnsEnabled,
  createCloudflareDnsRecord,
  deleteCloudflareDnsRecord,
  listCloudflareDnsRecords,
} from '@/lib/server/cloudflare-dns';
import { resolverDomain } from '@/lib/server/config';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { requireAssetOwner } from '@/lib/server/ownership';

export const dynamic = 'force-dynamic';

function parseTarget(url: URL): { tld: string; subLabel: string } {
  const tld = tldSchema.parse(url.searchParams.get('tld') ?? '');
  const subLabel = optionalSubLabelSchema.parse(url.searchParams.get('sub') ?? '');
  return { tld, subLabel };
}

export const GET = route(
  async (request) => {
    const { tld, subLabel } = parseTarget(new URL(request.url));
    await requireAssetOwner(request, tld, subLabel);

    const records = await listDnsRecords(tld, subLabel);
    const cfConfigured = cloudflareDnsEnabled();
    const fqdn = buildSafeFqdn(tld, subLabel);

    let cloudflareRecords: Awaited<ReturnType<typeof listCloudflareDnsRecords>> = [];
    let cloudflareError: string | null = null;
    if (cfConfigured) {
      try {
        cloudflareRecords = await listCloudflareDnsRecords(fqdn);
      } catch (err) {
        cloudflareError = err instanceof Error ? err.message : 'Ошибка Cloudflare API';
      }
    }

    return jsonResponse({
      tld,
      subLabel,
      fqdn,
      resolverDomain: resolverDomain(),
      serverIp: '95.182.89.37',
      cloudflareConfigured: cfConfigured,
      cloudflareError,
      cloudflareRecords,
      records,
    });
  },
  { limit: 'read', bucket: 'dns-list' },
);

export const POST = route(
  async (request) => {
    const body = await readJson(request, dnsRecordCreateSchema);
    const { session } = await requireAssetOwner(request, body.tld, body.subLabel);

    const fqdn = buildSafeFqdn(body.tld, body.subLabel);

    const cf = await createCloudflareDnsRecord({
      type: body.recordType,
      fqdn,
      content: body.content,
      ttl: body.ttl,
      priority: body.priority,
    });

    const record = await insertDnsRecord({
      tld: body.tld,
      subLabel: body.subLabel,
      recordType: body.recordType,
      fqdn,
      content: body.content,
      ttl: body.ttl,
      priority: body.priority ?? null,
      cfRecordId: cf.id,
      ownerAddress: session.address,
    });

    return jsonResponse({ ok: true, record, synced: cf.synced }, { status: 201 });
  },
  { limit: 'write', bucket: 'dns-create' },
);

export const DELETE = route(
  async (request) => {
    const url = new URL(request.url);
    const { tld, subLabel } = parseTarget(url);
    await requireAssetOwner(request, tld, subLabel);

    const id = url.searchParams.get('id')?.trim();
    if (!id) throw ApiError.badRequest('MISSING_ID', 'Укажите id DNS-записи');

    const record = await getDnsRecordById(id);
    if (!record || record.tld !== tld || record.subLabel !== subLabel) {
      throw ApiError.notFound('DNS-запись не найдена');
    }

    if (record.cfRecordId && cloudflareDnsEnabled()) {
      await deleteCloudflareDnsRecord(record.cfRecordId);
    }

    await deleteDnsRecordById(id);
    return jsonResponse({ ok: true, id });
  },
  { limit: 'write', bucket: 'dns-delete' },
);
