import { z } from 'zod';
import {
  deleteSiteFile,
  getSiteSettings,
  getSiteStorageStats,
  listSiteFiles,
  upsertSiteFile,
  upsertSiteSettings,
} from '@justtld/db';
import {
  ApiError,
  optionalSubLabelSchema,
  siteFilePathSchema,
  siteSettingsSchema,
  tldSchema,
} from '@justtld/shared';
import { jsonResponse, readJson, route } from '@/lib/server/http';
import { requireAssetOwner } from '@/lib/server/ownership';
import { ensureStarterSite } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SITE_BYTES = 10 * 1024 * 1024;

function guessMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.xml')) return 'application/xml; charset=utf-8';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  return 'application/octet-stream';
}

function parseTarget(url: URL): { tld: string; subLabel: string } {
  const tld = tldSchema.parse(url.searchParams.get('tld') ?? '');
  const subLabel = optionalSubLabelSchema.parse(url.searchParams.get('sub') ?? '');
  return { tld, subLabel };
}

export const GET = route(
  async (request) => {
    const { tld, subLabel } = parseTarget(new URL(request.url));
    const { session, ownership } = await requireAssetOwner(request, tld, subLabel);
    const [settings, files, stats] = await Promise.all([
      getSiteSettings(tld, subLabel),
      listSiteFiles(tld, subLabel),
      getSiteStorageStats(tld, subLabel),
    ]);

    return jsonResponse({
      tld,
      subLabel,
      ownership: {
        isOwner: ownership.isOwner,
        isAdmin: session.role === 'admin',
        ownerAddress: ownership.assetOwner,
        via: ownership.via,
      },
      settings,
      files,
      totalBytes: stats.totalBytes,
      maxSiteBytes: MAX_SITE_BYTES,
      maxFileBytes: MAX_FILE_BYTES,
    });
  },
  { limit: 'read', bucket: 'sites-files-list' },
);

const putBodySchema = z.object({
  path: siteFilePathSchema,
  content: z.string().max(2_800_000).optional(),
  contentBase64: z.string().max(2_800_000).optional(),
  mimeType: z.string().trim().max(120).optional(),
});

export const PUT = route(
  async (request) => {
    const { tld, subLabel } = parseTarget(new URL(request.url));
    const { session } = await requireAssetOwner(request, tld, subLabel);

    const body = await readJson(request, putBodySchema);
    const bytes = body.contentBase64
      ? Buffer.from(body.contentBase64, 'base64')
      : Buffer.from(body.content ?? '', 'utf8');

    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw ApiError.badRequest(
        'FILE_TOO_LARGE',
        `Размер одного файла не должен превышать ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} МБ`,
      );
    }

    const existing = await listSiteFiles(tld, subLabel);
    const currentTotal = existing
      .filter((f) => f.path !== body.path)
      .reduce((acc, f) => acc + f.sizeBytes, 0);

    if (currentTotal + bytes.byteLength > MAX_SITE_BYTES) {
      throw ApiError.badRequest(
        'SITE_QUOTA_EXCEEDED',
        `Превышен лимит сайта (${Math.round(MAX_SITE_BYTES / 1024 / 1024)} МБ)`,
      );
    }

    const mimeType = body.mimeType?.trim() || guessMimeType(body.path);
    const file = await upsertSiteFile({
      tld,
      subLabel,
      path: body.path,
      mimeType,
      content: bytes,
      updatedBy: session.address,
    });

    const settings = await getSiteSettings(tld, subLabel);
    if (settings.mode === 'card') {
      await upsertSiteSettings({
        tld,
        subLabel,
        mode: 'hosting',
        entryFile: 'index.html',
      });
    }

    return jsonResponse({ ok: true, file });
  },
  { limit: 'write', bucket: 'sites-files-put' },
);

const patchBodySchema = siteSettingsSchema
  .omit({ tld: true, subLabel: true })
  .extend({ seedStarter: z.boolean().optional() });

export const PATCH = route(
  async (request) => {
    const { tld, subLabel } = parseTarget(new URL(request.url));
    const { session } = await requireAssetOwner(request, tld, subLabel);
    const body = await readJson(request, patchBodySchema);

    if (body.seedStarter) {
      await ensureStarterSite(tld, subLabel, session.address);
    }

    const settings = await upsertSiteSettings({
      tld,
      subLabel,
      mode: body.mode,
      entryFile: body.entryFile,
      spaFallback: body.spaFallback,
    });

    const files = await listSiteFiles(tld, subLabel);
    return jsonResponse({ ok: true, settings, files });
  },
  { limit: 'write', bucket: 'sites-settings-patch' },
);

export const DELETE = route(
  async (request) => {
    const url = new URL(request.url);
    const { tld, subLabel } = parseTarget(url);
    await requireAssetOwner(request, tld, subLabel);

    const filePath = siteFilePathSchema.parse(url.searchParams.get('path') ?? '');
    const deleted = await deleteSiteFile(tld, subLabel, filePath);
    if (!deleted) {
      throw ApiError.notFound(`Файл ${filePath} не найден`);
    }
    return jsonResponse({ ok: true, path: filePath });
  },
  { limit: 'write', bucket: 'sites-files-delete' },
);
