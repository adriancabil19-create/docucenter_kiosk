import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ConditionalLayout } from '@/components/conditional-layout';

export const metadata: Metadata = {
  title: 'DocuCenter Admin',
  description: 'Admin console for DocuCenter Kiosk System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <Providers>
          <ConditionalLayout>{children}</ConditionalLayout>
        </Providers>
      </body>
    </html>
  );
}
