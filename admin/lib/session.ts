import { SessionOptions } from 'iron-session';

export interface SessionData {
  user?: { username: string };
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'docucenter_admin_session',
  cookieOptions: {
    httpOnly: true,
    // Keep secure=false so the cookie is sent over plain HTTP (local kiosk LAN access).
    // Browsers silently drop Secure cookies on http:// origins, causing redirect loops.
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 hours
  },
};
