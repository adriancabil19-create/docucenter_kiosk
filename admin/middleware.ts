import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// `/legal` is intentionally public — privacy/terms/refund notices must be
// readable without signing in.
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/legal'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and Next.js internals
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Check for encrypted session cookie set by iron-session
  const session = request.cookies.get('docucenter_admin_session');
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
