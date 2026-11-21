import {
  getCustody,
  getSiteFile,
  getSiteSettings,
  getSubdomainByName,
  getZoneByTld,
} from '@justtld/db';
import { optionalSubLabelSchema, tldSchema } from '@justtld/shared';
import { parseZoneMetadata } from '@/lib/metadata';
import { resolverDomain } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCandidates(rawPath: string, entryFile: string, spaFallback: boolean): string[] {
  const trimmed = rawPath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed) {
    return Array.from(new Set([entryFile, 'index.html']));
  }
  const candidates = [trimmed];
  if (!trimmed.includes('.')) {
    candidates.push(`${trimmed}.html`, `${trimmed}/index.html`);
    if (spaFallback) {
      candidates.push(entryFile, 'index.html');
    }
  }
  return Array.from(new Set(candidates));
}

function renderParkedHtml(params: {
  fqdn: string;
  tld: string;
  exists: boolean;
  ownerAddress: string | null;
  portalOrigin: string;
}): Response {
  const title = params.exists
    ? `${params.fqdn} — домен зарегистрирован в JustTLD`
    : `${params.fqdn} — домен свободен в JustTLD`;
  const manageUrl = `${params.portalOrigin}/zone/${encodeURIComponent(params.tld)}`;
  const storeUrl = `${params.portalOrigin}/store?tld=${encodeURIComponent(params.tld)}`;

  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Inter,system-ui,sans-serif;background:#09090b;color:#f4f4f5;padding:24px}
    .card{max-width:560px;width:100%;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px}
    .badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;background:${params.exists ? '#14532d' : '#1e3a8a'};color:${params.exists ? '#86efac' : '#93c5fd'};margin-bottom:14px}
    h1{margin:0 0 12px;font-size:24px;word-break:break-all}
    p{margin:0 0 20px;color:#a1a1aa;line-height:1.55}
    .owner{font-family:monospace;font-size:12px;background:#09090b;padding:8px 12px;border-radius:8px;margin-bottom:20px;word-break:break-all;color:#d4d4d8}
    .btn{display:inline-block;padding:10px 18px;border-radius:10px;background:#6366f1;color:#fff;text-decoration:none;font-weight:600}
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">${params.exists ? 'Активный домен JustTLD' : 'Домен не настроен'}</span>
    <h1>${escapeHtml(params.fqdn)}</h1>
    <p>${
      params.exists
        ? 'Для этого домена ещё не включён встроенный хостинг или переадресация. Владелец может загрузить сайт в файловом менеджере или настроить DNS.'
        : 'Этот домен пока не занят или не опубликован в JustTLD. Вы можете приобрести его в магазине.'
    }</p>
    ${params.ownerAddress ? `<div class="owner">Владелец: ${escapeHtml(params.ownerAddress)}</div>` : ''}
    <a class="btn" href="${escapeHtml(params.exists ? manageUrl : storeUrl)}">
      ${params.exists ? 'Управлять доменом' : 'Перейти в магазин JustTLD'}
    </a>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: params.exists ? 200 : 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rawZone = (url.searchParams.get('zone') ?? request.headers.get('x-site-zone') ?? '')
    .trim()
    .toLowerCase();
  const rawLabel = (url.searchParams.get('label') ?? request.headers.get('x-site-label') ?? '')
    .trim()
    .toLowerCase();
  const rawPath = url.searchParams.get('path') ?? request.headers.get('x-site-path') ?? '/';
  const isRootMode =
    (url.searchParams.get('root') ?? request.headers.get('x-site-root') ?? '0') === '1';

  const parsedTld = tldSchema.safeParse(rawZone.startsWith('.') ? rawZone : `.${rawZone}`);
  if (!parsedTld.success) {
    return new Response('Invalid zone', { status: 400 });
  }
  const tld = parsedTld.data;

  const parsedLabel = optionalSubLabelSchema.safeParse(rawLabel);
  if (!parsedLabel.success) {
    return new Response('Invalid subdomain label', { status: 400 });
  }
  const subLabel = parsedLabel.data;

  const settings = await getSiteSettings(tld, subLabel);

  if (settings.mode === 'hosting') {
    const candidates = buildCandidates(
      rawPath,
      settings.entryFile || 'index.html',
      settings.spaFallback,
    );
    for (const candidate of candidates) {
      const file = await getSiteFile(tld, subLabel, candidate);
      if (file) {
        let body: BodyInit = new Uint8Array(file.content);
        const isHtml = file.mimeType.toLowerCase().includes('text/html');
        if (isHtml && !settings.proUnlocked) {
          const portal = `https://${resolverDomain() || 'justtld.online'}`;
          const badge = `<a href="${portal}" target="_blank" rel="noopener noreferrer" style="position:fixed;right:12px;bottom:12px;z-index:2147483647;display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;background:rgba(10,12,18,0.88);color:#e4e4e7;border:1px solid rgba(255,255,255,0.16);font:500 11px/1 Inter,system-ui,sans-serif;text-decoration:none;backdrop-filter:blur(8px);box-shadow:0 4px 16px rgba(0,0,0,0.3)">Работает на JustTLD · @JustTLD</a>`;
          const rawHtml = Buffer.from(file.content).toString('utf8');
          body = /<\/body>/i.test(rawHtml)
            ? rawHtml.replace(/<\/body>/i, `${badge}</body>`)
            : `${rawHtml}${badge}`;
        }
        return new Response(body, {
          status: 200,
          headers: {
            'Content-Type': file.mimeType,
            'Cache-Control': 'public, max-age=60',
            'X-Content-Type-Options': 'nosniff',
            'X-JustTLD-Site': subLabel ? `${subLabel}.${tld}` : tld,
          },
        });
      }
    }
    return new Response(`404 Not Found: ${rawPath}`, {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const tldClean = tld.replace(/^\./, '');
  const fullSubName = subLabel ? `${subLabel}.${tldClean}` : '';

  const [zone, subdomain, custody] = await Promise.all([
    getZoneByTld(tld),
    fullSubName ? getSubdomainByName(fullSubName) : Promise.resolve(null),
    getCustody(tld, subLabel),
  ]);

  const rawMeta = subLabel ? subdomain?.metadata : zone?.metadata;
  const parsedMeta = parseZoneMetadata(rawMeta);
  if (parsedMeta.url) {
    return Response.redirect(parsedMeta.url, 307);
  }

  const domain = resolverDomain();
  const fqdn = isRootMode
    ? subLabel
      ? `${subLabel}.${tldClean}`
      : tldClean
    : subLabel
      ? `${subLabel}.${tldClean}.${domain}`
      : `${tldClean}.${domain}`;
  const ownerAddress =
    (subLabel ? subdomain?.ownerAddress : zone?.ownerAddress) ?? custody?.ownerAddress ?? null;

  return renderParkedHtml({
    fqdn,
    tld,
    exists: Boolean(zone || subdomain || custody),
    ownerAddress,
    portalOrigin: `https://${domain}`,
  });
}
