import { SessionOptions } from 'iron-session';

export type ConsoleRole = 'ADMIN' | 'STAFF';

export interface SessionData {
  user?: {
    username: string;
    /** Determined server-side at login — never trust a role from the browser. */
    role: ConsoleRole;
    /** Set only for role STAFF — the staff.id this session was authenticated as. */
    staffId?: string;
    name?: string;
  };
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'docucenter_admin_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 hours
  },
};
