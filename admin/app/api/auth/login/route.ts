import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, SessionData } from '@/lib/session';

const attempts = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 10;
const WINDOW_MS = 15 * 60 * 1000;

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
    const missing = [
      !expectedUser && 'ADMIN_USERNAME',
      !expectedPass && 'ADMIN_PASSWORD',
      !sessionSecret && 'SESSION_SECRET',
    ]
      .filter(Boolean)
      .join(', ');
    return NextResponse.json(
      { error: `Server misconfigured — missing env vars: ${missing}` },
      { status: 500 },
    );
  }

  const { username, password } = await request.json();

  if (username.trim() !== expectedUser || password.trim() !== expectedPass) {
    const next = current && current.resetAt > now
      ? { count: current.count + 1, resetAt: current.resetAt }
      : { count: 1, resetAt: now + WINDOW_MS };
    attempts.set(address, next);
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  attempts.delete(address);

  try {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    session.user = { username };
    await session.save();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Session error: ${String(err)}` },
      { status: 500 },
    );
  }
}
