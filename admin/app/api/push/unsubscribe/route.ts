import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { backendFetch } from '@/lib/backend';

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
  const { endpoint } = (body ?? {}) as { endpoint?: string };
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
  }

  try {
    const upstream = await backendFetch('/api/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
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
