import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

// `/legal` is intentionally public — privacy/terms/refund notices must be
// readable without signing in.
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/legal'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    isPublic(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Actually decrypt & verify the iron-session cookie — presence alone is not
  // enough, a forged cookie value must be rejected. Any failure (bad cookie,
  // missing/short SESSION_SECRET) is treated as "not authenticated".
  const res = NextResponse.next();
  let authed = false;
  try {
    const session = await getIronSession<SessionData>(request, res, sessionOptions);
    authed = Boolean(session.user);
  } catch {
    authed = false;
  }

  if (!authed) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
