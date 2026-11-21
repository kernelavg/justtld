import { ApiError, normalizeTld, validateTldFormat } from '@justtld/shared';
import {
  getSubdomainByName,
  listSubdomainEvents,
  refreshExpiredSubdomainStatuses,
} from '@justtld/db';
import { jsonResponse, route } from '@/lib/server/http';
import { subdomainsEnabled } from '@/lib/server/config';
import { chainSubdomainToDto, readChainSubdomain, subdomainName } from '@/lib/server/subdomains';

export const dynamic = 'force-dynamic';

/** Один поддомен: кэш индексатора + состояние контракта. */
export const GET = route(
  async (request, context) => {
    const params = await (context as unknown as { params: Promise<{ tld: string; label: string }> })
      .params;
    const tld = normalizeTld(params.tld);
    if (!validateTldFormat(tld).ok) {
      throw ApiError.badRequest('INVALID_TLD', 'Некорректная зона в URL');
    }
    const label = decodeURIComponent(params.label ?? '')
      .trim()
      .toLowerCase();
    if (!/^[a-z0-9-]{1,32}$/.test(label)) {
      throw ApiError.badRequest('INVALID_LABEL', 'Некорректная метка поддомена');
    }

    await refreshExpiredSubdomainStatuses().catch(() => 0);
    const cached = await getSubdomainByName(subdomainName(tld, label)).catch(() => null);
    const chain = subdomainsEnabled() ? await readChainSubdomain(tld, label) : null;

    if (!cached && !chain) {
      throw ApiError.notFound('Поддомен не найден');
    }

    const events = cached
      ? await listSubdomainEvents(cached.name, { page: 1, limit: 20 }).catch(() => null)
      : null;

    return jsonResponse({
      subdomain: cached ?? (chain ? { ...chainSubdomainToDto(tld, label, chain), id: '' } : null),
      chain: chain ? chainSubdomainToDto(tld, label, chain) : null,
      events: events?.items ?? [],
    });
  },
  { limit: 'read', bucket: 'subdomain-detail' },
);
