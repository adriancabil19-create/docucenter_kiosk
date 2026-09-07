import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, SessionData } from './session';

/**
 * Read (and, if needed, mutate) the admin session from a Route Handler or
 * Server Component. Not for middleware — that uses the request/response
 * overload of `getIronSession` directly so it stays on the edge runtime.
 */
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
