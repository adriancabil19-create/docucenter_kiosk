import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { backendFetch } from '@/lib/backend';

// Session-gated: the subscription's owner identity comes from the server
// session, never from the request body, so a browser can't register a
// subscription claiming to be someone else (same trust boundary as every
// other console -> backend call).
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { endpoint, keys } = (body ?? {}) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'endpoint and keys are required' }, { status: 400 });
  }

  try {
    const upstream = await backendFetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint,
        keys,
        ownerRole: session.user.role,
        ownerUsername: session.user.username,
      }),
    });
    const payload = await upstream.text();
    return new NextResponse(payload, {
      status: upstream.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 });
  }
}
