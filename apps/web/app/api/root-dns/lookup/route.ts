import { getRootDnsSnapshot } from '@justtld/db';
import { ApiError } from '@justtld/shared';
import { jsonResponse, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA']);

export const GET = route(
  async (request) => {
    const url = new URL(request.url);
    const rawName = (url.searchParams.get('name') ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    const type = (url.searchParams.get('type') ?? 'A').trim().toUpperCase();

    if (!rawName || !/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(rawName)) {
      throw ApiError.badRequest('INVALID_NAME', 'Укажите корректное имя зоны или поддомена (например: expline или shop.expline)');
    }
    if (!ALLOWED_TYPES.has(type)) {
      throw ApiError.badRequest('INVALID_TYPE', 'Поддерживаются типы A, AAAA, CNAME, MX, TXT, NS, SOA');
    }

    // 1. Пробуем реальный живой DoH-резолвер на https://root.justtld.online/dns-query
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const dohRes = await fetch(
        `https://root.justtld.online/dns-query?name=${encodeURIComponent(rawName)}&type=${encodeURIComponent(type)}`,
        {
          headers: { Accept: 'application/dns-json' },
          signal: controller.signal,
          cache: 'no-store',
        },
      );
      clearTimeout(timer);
      if (dohRes.ok) {
        const data = (await dohRes.json()) as {
          Status?: number;
          Answer?: Array<{ name: string; type: number; TTL: number; data: string }>;
          Authority?: Array<{ name: string; type: number; TTL: number; data: string }>;
          JustTLDRoot?: boolean;
          Zone?: string;
        };
        return jsonResponse({
          source: 'live-doh',
          dohUrl: 'https://root.justtld.online/dns-query',
          name: rawName,
          type,
          status: data.Status ?? 0,
          rootActive: Boolean(data.JustTLDRoot),
          zone: data.Zone ?? null,
          answers: data.Answer ?? [],
          authority: data.Authority ?? [],
        });
      }
    } catch {
      // fallback на прямой расчёт из БД
    }

    // 2. Fallback: вычисляем напрямую по снимку реестра
    const snapshot = await getRootDnsSnapshot();
    const parts = rawName.split('.');
    const zone = parts[parts.length - 1] ?? rawName;
    const subLabel = parts.length === 2 ? (parts[0] ?? '') : '';
    const zoneMatch = snapshot.zones.find((z) => z.zone === zone);

    if (!zoneMatch) {
      return jsonResponse({
        source: 'db-fallback',
        dohUrl: 'https://root.justtld.online/dns-query',
        name: rawName,
        type,
        status: 3, // NXDOMAIN
        rootActive: false,
        zone: null,
        answers: [],
        authority: [],
      });
    }

    const custom = snapshot.records.filter(
      (r) =>
        r.tld.replace(/^\.+/, '').toLowerCase() === zone &&
        r.subLabel.toLowerCase() === subLabel &&
        r.recordType === type,
    );

    const answers =
      custom.length > 0
        ? custom.map((r) => ({
            name: rawName,
            type: r.recordType,
            TTL: r.ttl,
            data: r.priority != null ? `${r.priority} ${r.content}` : r.content,
          }))
        : type === 'A'
          ? [{ name: rawName, type: 'A', TTL: 60, data: '95.182.89.37' }]
          : type === 'NS'
            ? [{ name: rawName, type: 'NS', TTL: 300, data: 'ns1.root.justtld.online' }]
            : [];

    return jsonResponse({
      source: 'db-fallback',
      dohUrl: 'https://root.justtld.online/dns-query',
      name: rawName,
      type,
      status: 0,
      rootActive: true,
      zone,
      answers,
      authority: [],
    });
  },
  { limit: 'read', bucket: 'root-dns-lookup' },
);
