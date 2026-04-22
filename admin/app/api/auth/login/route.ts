import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, SessionData } from '@/lib/session';

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  const expectedUser = (process.env.ADMIN_USERNAME ?? '').trim();
  const expectedPass = (process.env.ADMIN_PASSWORD ?? '').trim();

  if (!expectedUser || !expectedPass) {
    return NextResponse.json(
      { error: 'Server misconfigured: ADMIN_USERNAME or ADMIN_PASSWORD not set' },
      { status: 500 },
    );
  }

  if (username.trim() !== expectedUser || password.trim() !== expectedPass) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  session.user = { username };
  await session.save();

  return NextResponse.json({ success: true });
}
