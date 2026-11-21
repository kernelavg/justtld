import { METADATA_MAX_LENGTH } from '@justtld/shared';

export type ParsedMetadata = {
  isJson: boolean;
  url: string | null;
  title: string | null;
  description: string | null;
  extra: Array<[string, string]>;
  raw: string;
};

/** Достаёт url/site/redirect, title и description из строки метаданных. */
export function parseZoneMetadata(raw: string | null | undefined): ParsedMetadata {
  const source = (raw ?? '').trim();
  if (!source) {
    return { isJson: false, url: null, title: null, description: null, extra: [], raw: '' };
  }
  try {
    const parsed = JSON.parse(source) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const str = (key: string) =>
        typeof record[key] === 'string' && (record[key] as string).trim()
          ? (record[key] as string).trim()
          : null;
      const urlCandidate = str('url') ?? str('site') ?? str('redirect');
      const safeUrl =
        urlCandidate && /^https?:\/\//i.test(urlCandidate) ? urlCandidate : null;
      const title = str('title') ?? str('name');
      const description = str('description') ?? str('desc') ?? str('bio');

      const known = new Set(['url', 'site', 'redirect', 'title', 'name', 'description', 'desc', 'bio']);
      const extra: Array<[string, string]> = [];
      for (const [k, v] of Object.entries(record)) {
        if (known.has(k) || v === undefined || v === null) continue;
        extra.push([k, typeof v === 'string' ? v : JSON.stringify(v)]);
      }

      return { isJson: true, url: safeUrl, title, description, extra, raw: source };
    }
  } catch {
    // не JSON — отдаём как обычный текст
  }
  const directUrl = /^https?:\/\/\S+$/i.test(source) ? source : null;
  return { isJson: false, url: directUrl, title: null, description: null, extra: [], raw: source };
}

/** Собирает компактный JSON для метаданных (в пределах 512 байт контракта). */
export function buildMetadataJson(fields: {
  url?: string;
  title?: string;
  description?: string;
}): { json: string; bytes: number; tooLong: boolean } {
  const payload: Record<string, string> = {};
  if (fields.url?.trim()) payload.url = fields.url.trim();
  if (fields.title?.trim()) payload.title = fields.title.trim();
  if (fields.description?.trim()) payload.description = fields.description.trim();
  const json = Object.keys(payload).length > 0 ? JSON.stringify(payload) : '';
  const bytes = new TextEncoder().encode(json).length;
  return { json, bytes, tooLong: bytes > METADATA_MAX_LENGTH };
}

/** Генерирует рабочие адреса резолвера для зоны или поддомена. */
export function buildResolverLinks(options: {
  tld: string;
  label?: string | null;
  baseDomain?: string;
}): Array<{ label: string; url: string; recommended?: boolean }> {
  const zone = options.tld.replace(/^\.+/, '').toLowerCase();
  const domain = (options.baseDomain ?? 'justtld.online').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const sub = options.label?.trim().toLowerCase() ?? '';

  if (sub) {
    return [
      {
        label: 'На хосте зоны',
        url: `https://${zone}.${domain}/${sub}`,
        recommended: true,
      },
      {
        label: 'Плоский поддомен',
        url: `https://${sub}--${zone}.${domain}`,
      },
      {
        label: 'Путь на основном домене',
        url: `https://${domain}/${zone}/${sub}`,
      },
    ];
  }

  return [
    {
      label: 'Хост зоны',
      url: `https://${zone}.${domain}`,
      recommended: true,
    },
    {
      label: 'Путь на основном домене',
      url: `https://${domain}/${zone}`,
    },
  ];
}
