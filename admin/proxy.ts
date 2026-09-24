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

// Pages role STAFF may not open. Everything not listed here (Dashboard,
// Kiosks, Kiosk Status, Assistance) is shared with ADMIN. Enforced here (not
// just by hiding nav links) since this runs server-side before the page
// renders — see rule 6, "hiding buttons is not sufficient."
const ADMIN_ONLY_PATH_PREFIXES = [
  '/staff',
  '/pricing',
  '/payments',
  '/storage',
  '/paper',
  '/print-jobs',
  '/transactions',
  '/analytics',
  '/logs',
  '/alerts',
];

function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    isPublic(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.png' ||
    pathname === '/icon-192.png' ||
    pathname === '/apple-icon.png' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/.well-known/')
  ) {
    return NextResponse.next();
  }

  // Actually decrypt & verify the iron-session cookie — presence alone is not
  // enough, a forged cookie value must be rejected. Any failure (bad cookie,
  // missing/short SESSION_SECRET) is treated as "not authenticated".
  const res = NextResponse.next();
  let session: SessionData | null = null;
  try {
    session = await getIronSession<SessionData>(request, res, sessionOptions);
  } catch {
    session = null;
  }
  const authed = Boolean(session?.user);

  if (!authed) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Role is decided server-side at login (session.user.role) — never trust a
  // client-supplied role for this check.
  if (session!.user!.role === 'STAFF' && !pathname.startsWith('/api/') && isAdminOnlyPath(pathname)) {
    return NextResponse.redirect(new URL('/assistance', request.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
