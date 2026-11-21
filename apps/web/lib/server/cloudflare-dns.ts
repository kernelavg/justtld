import { ApiError, type DnsRecordType } from '@justtld/shared';
import { cfApiToken, cfZoneId, resolverDomain } from './config';

export function cloudflareDnsEnabled(): boolean {
  return Boolean(cfApiToken() && cfZoneId());
}

/** Строит нативный домен 1-го или 2-го уровня в независимом корне JustTLD (без ICANN). */
export function buildRootFqdn(tld: string, subLabel = ''): string {
  const zone = tld.replace(/^\.+/, '').toLowerCase();
  const sub = subLabel.trim().toLowerCase();
  if (!zone || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(zone)) {
    throw ApiError.badRequest('INVALID_TLD', 'Некорректная зона для DNS');
  }
  if (!sub) return zone;
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(sub) || sub.includes('--')) {
    throw ApiError.badRequest('INVALID_LABEL', 'Некорректная метка поддомена для DNS');
  }
  return `${sub}.${zone}`;
}

/** Строит безопасный FQDN строго внутри домена резолвера, не давая тронуть корень и системные имена. */
export function buildSafeFqdn(tld: string, subLabel = ''): string {
  const domain = resolverDomain();
  const zone = tld.replace(/^\.+/, '').toLowerCase();
  const sub = subLabel.trim().toLowerCase();
  if (!zone || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(zone)) {
    throw ApiError.badRequest('INVALID_TLD', 'Некорректная зона для DNS');
  }
  if (['www', 'api', 'admin', 'app', '_acme-challenge'].includes(zone)) {
    throw ApiError.forbidden('Системное имя зарезервировано');
  }
  if (!sub) return `${zone}.${domain}`;
  if (
    sub.startsWith('_acme-challenge') ||
    !/^[a-z0-9][a-z0-9-]{0,31}$/.test(sub) ||
    sub.includes('--')
  ) {
    throw ApiError.badRequest('INVALID_LABEL', 'Некорректная метка поддомена для DNS');
  }
  return `${sub}.${zone}.${domain}`;
}

export async function createCloudflareDnsRecord(input: {
  type: DnsRecordType;
  fqdn: string;
  content: string;
  ttl: number;
  priority?: number | null;
}): Promise<{ id: string | null; synced: boolean }> {
  const token = cfApiToken();
  const zoneId = cfZoneId();
  if (!token || !zoneId) {
    return { id: null, synced: false };
  }

  const body: Record<string, unknown> = {
    type: input.type,
    name: input.fqdn,
    content: input.content,
    ttl: input.ttl,
    proxied: false,
  };
  if (input.type === 'MX' && input.priority !== undefined && input.priority !== null) {
    body.priority = input.priority;
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  const payload = (await response.json()) as {
    success?: boolean;
    result?: { id?: string };
    errors?: Array<{ message?: string; code?: number }>;
  };
  if (!response.ok || !payload.success || !payload.result?.id) {
    const msg = payload.errors?.[0]?.message ?? `Cloudflare API error (${response.status})`;
    throw new ApiError(400, 'CLOUDFLARE_DNS_ERROR', msg);
  }
  return { id: payload.result.id, synced: true };
}

export async function deleteCloudflareDnsRecord(cfRecordId: string | null): Promise<void> {
  if (!cfRecordId) return;
  const token = cfApiToken();
  const zoneId = cfZoneId();
  if (!token || !zoneId) return;

  await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${cfRecordId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  ).catch(() => undefined);
}

export async function listCloudflareDnsRecords(fqdn: string): Promise<
  Array<{ id: string; type: string; name: string; content: string; ttl: number; proxied?: boolean }>
> {
  const token = cfApiToken();
  const zoneId = cfZoneId();
  if (!token || !zoneId) return [];

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${encodeURIComponent(fqdn)}&per_page=100`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const payload = (await response.json()) as {
    success?: boolean;
    result?: Array<{
      id: string;
      type: string;
      name: string;
      content: string;
      ttl: number;
      proxied?: boolean;
    }>;
  };
  if (!response.ok || !payload.success || !Array.isArray(payload.result)) {
    return [];
  }
  return payload.result;
}
