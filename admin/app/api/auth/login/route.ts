import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, SessionData } from '@/lib/session';

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

  const ok =
    safeEqual(username.trim(), expectedUser) && safeEqual(password.trim(), expectedPass);
  if (!ok) {
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
    session.user = { username: expectedUser };
    await session.save();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Session save failed:', err);
    return NextResponse.json({ error: 'Could not start session. Try again.' }, { status: 500 });
  }
}
