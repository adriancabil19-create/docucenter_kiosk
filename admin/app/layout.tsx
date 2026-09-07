import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ConditionalLayout } from '@/components/conditional-layout';

export const metadata: Metadata = {
  title: 'DocuCenter Admin',
  description: 'Admin console for the DocuCenter Kiosk — an undergraduate thesis prototype.',
  applicationName: 'DocuCenter Admin',
  authors: [{ name: 'Charles Adrian L. Cabil', url: 'mailto:adriancabil12@gmail.com' }],
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="text-slate-800 antialiased">
        <Providers>
          <ConditionalLayout>{children}</ConditionalLayout>
        </Providers>
      </body>
    </html>
  );
}
