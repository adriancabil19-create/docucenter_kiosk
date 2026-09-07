import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { backendFetch } from '@/lib/backend';

// Session-gated reverse proxy to the kiosk backend. The browser never sees the
// backend URL or the admin bearer token — this handler adds them server-side
// after checking the admin session. Only the paths the console actually uses
// are forwarded, so it cannot be turned into an open relay.
const ALLOWED_PREFIXES = ['api/monitoring/', 'api/paper-tracker/', 'api/storage/'];
const ALLOWED_EXACT = ['health'];

function isAllowed(path: string): boolean {
  return ALLOWED_EXACT.includes(path) || ALLOWED_PREFIXES.some((p) => path.startsWith(p));
}

async function handle(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { path: segments } = await ctx.params;
  const path = (segments ?? []).map(decodeURIComponent).join('/');

  if (path.includes('..') || !isAllowed(path)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const search = request.nextUrl.search;
  const hasBody = request.method !== 'GET' && request.method !== 'DELETE';

  let upstream: Response;
  try {
    upstream = await backendFetch(`/${path}${search}`, {
      method: request.method,
      body: hasBody ? await request.text() : undefined,
    });
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  const payload = await upstream.text();
  return new NextResponse(payload, {
    status: upstream.status,
    headers: { 'content-type': contentType, 'cache-control': 'no-store' },
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
