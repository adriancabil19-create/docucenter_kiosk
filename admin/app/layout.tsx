import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { Providers } from './providers';
import { ConditionalLayout } from '@/components/conditional-layout';
import { getSession } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'DocuCenter Admin',
  description: 'Admin console for the DocuCenter Kiosk — an undergraduate thesis prototype.',
  applicationName: 'DocuCenter Admin',
  authors: [{ name: 'Charles Adrian L. Cabil', url: 'mailto:adriancabil12@gmail.com' }],
  robots: { index: false, follow: false },
  // iOS ignores the web manifest's `display` on older versions: without these
  // Apple-specific tags, "Add to Home Screen" produces a plain Safari
  // bookmark (browser chrome and all) rather than a standalone app window.
  appleWebApp: {
    capable: true,
    title: 'DocuCenter',
    statusBarStyle: 'default',
  },
  // Next emits only the modern `mobile-web-app-capable`, which iOS before
  // 16.4 ignores — those versions read nothing but Apple's own (deprecated)
  // spelling, so both have to be on the page.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read once, server-side, and hand the role down as a prop — the nav (a
  // Client Component, for usePathname()) filters what it renders from this
  // instead of re-deriving auth state itself. Absent on /login and /legal,
  // where no session exists yet.
  const session = await getSession().catch(() => null);
  const role = session?.user?.role ?? null;

  return (
    <html lang="en">
      <body className="text-slate-800 antialiased">
        {/* Chrome can fire `beforeinstallprompt` before React hydrates — a
            listener attached from a Client Component's useEffect can miss
            it. `beforeInteractive` runs this before hydration so it's
            captured no matter how fast (or slow) the page loads; components
            like install-prompt.tsx read window.__deferredInstallPrompt.
            Also registers the service worker here, on every page, as early
            as possible — Chrome's installability check needs an ACTIVE
            (not just registering) service worker, and registering only from
            within install-prompt.tsx's useEffect (after hydration, /login
            only) left less time for that activation to finish first. */}
        <Script id="capture-install-prompt" strategy="beforeInteractive">
          {`window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            window.__deferredInstallPrompt = e;
          });
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(function () {});
          }`}
        </Script>
        <Providers>
          <ConditionalLayout role={role}>{children}</ConditionalLayout>
        </Providers>
      </body>
    </html>
  );
}
