import { NextResponse } from 'next/server';
import { incrementAdClick } from '@justtld/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const target = await incrementAdClick(id).catch(() => null);
  const safeTarget =
    target && (target.startsWith('https://') || target.startsWith('http://'))
      ? target
      : 'https://t.me/JustTLD';
  return NextResponse.redirect(safeTarget, { status: 302 });
}
