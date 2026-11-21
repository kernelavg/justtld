import { getSiteFile } from '@justtld/db';
import {
  ApiError,
  optionalSubLabelSchema,
  siteFilePathSchema,
  tldSchema,
} from '@justtld/shared';
import { jsonResponse, route } from '@/lib/server/http';
import { requireAssetOwner } from '@/lib/server/ownership';

export const dynamic = 'force-dynamic';

function isTextMimeType(mimeType: string): boolean {
  const lower = mimeType.toLowerCase();
  return (
    lower.startsWith('text/') ||
    lower.includes('javascript') ||
    lower.includes('json') ||
    lower.includes('svg') ||
    lower.includes('xml')
  );
}

export const GET = route(
  async (request) => {
    const url = new URL(request.url);
    const tld = tldSchema.parse(url.searchParams.get('tld') ?? '');
    const subLabel = optionalSubLabelSchema.parse(url.searchParams.get('sub') ?? '');
    const filePath = siteFilePathSchema.parse(url.searchParams.get('path') ?? '');

    await requireAssetOwner(request, tld, subLabel);

    const file = await getSiteFile(tld, subLabel, filePath);
    if (!file) throw ApiError.notFound(`Файл ${filePath} не найден`);

    const isText = isTextMimeType(file.mimeType);
    return jsonResponse({
      path: file.path,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      updatedAt: file.updatedAt,
      isText,
      content: isText ? file.content.toString('utf8') : null,
      contentBase64: isText ? null : file.content.toString('base64'),
    });
  },
  { limit: 'read', bucket: 'sites-files-content' },
);
