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
            like install-prompt.tsx read window.__deferredInstallPrompt. */}
        <Script id="capture-install-prompt" strategy="beforeInteractive">
          {`window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            window.__deferredInstallPrompt = e;
          });`}
        </Script>
        <Providers>
          <ConditionalLayout role={role}>{children}</ConditionalLayout>
        </Providers>
      </body>
    </html>
  );
}
