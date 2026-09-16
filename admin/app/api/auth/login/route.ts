import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, SessionData } from '@/lib/session';
import { backendFetch } from '@/lib/backend';

// In-memory, per-process rate limit. Fine for a single admin instance; if the
// console is ever scaled past one replica this needs a shared store.
const attempts = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 10;
const WINDOW_MS = 15 * 60 * 1000;

/** Constant-time string comparison via fixed-length digests. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(request: NextRequest) {
  const address = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const current = attempts.get(address);
  if (current && current.resetAt > now && current.count >= LIMIT) {
    return NextResponse.json({ error: 'Too many login attempts. Try again later.' }, { status: 429 });
  }

  const expectedUser = (process.env.ADMIN_USERNAME ?? '').trim();
  const expectedPass = (process.env.ADMIN_PASSWORD ?? '').trim();
  const sessionSecret = (process.env.SESSION_SECRET ?? '').trim();

  if (!expectedUser || !expectedPass || !sessionSecret) {
    console.error(
      'Login blocked — missing env vars:',
      [
        !expectedUser && 'ADMIN_USERNAME',
        !expectedPass && 'ADMIN_PASSWORD',
        !sessionSecret && 'SESSION_SECRET',
      ]
        .filter(Boolean)
        .join(', '),
    );
    return NextResponse.json({ error: 'Server misconfigured. Contact the operator.' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { username, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
  }

  const isAdmin =
    safeEqual(username.trim(), expectedUser) && safeEqual(password.trim(), expectedPass);

  // Staff web login (role STAFF) — a separate credential (password) from the
  // Staff Mode PIN used on the physical kiosk. Checked against the kiosk
  // backend's staff table via a trusted server-to-server call (this route
  // already holds ADMIN_API_TOKEN through backendFetch); the browser never
  // talks to that endpoint directly. Only attempted when the Admin check
  // above didn't match, so the single env-based Admin account keeps working
  // exactly as before.
  let staffLogin: { id: string; name: string; username: string } | null = null;
  if (!isAdmin) {
    try {
      const res = await backendFetch('/api/staff/verify-password', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          success: boolean;
          staff?: { id: string; name: string; username: string };
        };
        if (data.success && data.staff) staffLogin = data.staff;
      }
    } catch (err) {
      console.error('Staff login check failed (backend unreachable):', err);
    }
  }

  if (!isAdmin && !staffLogin) {
    const next =
      current && current.resetAt > now
        ? { count: current.count + 1, resetAt: current.resetAt }
        : { count: 1, resetAt: now + WINDOW_MS };
    attempts.set(address, next);
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  attempts.delete(address);

  try {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    session.user = isAdmin
      ? { username: expectedUser, role: 'ADMIN' }
      : { username: staffLogin!.username, role: 'STAFF', staffId: staffLogin!.id, name: staffLogin!.name };
    await session.save();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Session save failed:', err);
    return NextResponse.json({ error: 'Could not start session. Try again.' }, { status: 500 });
  }
}
