import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, SessionData } from '@/lib/session';

export async function POST(request: NextRequest) {
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
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

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
