import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { NavSidebar } from '@/components/nav-sidebar';

export const metadata: Metadata = {
  title: 'DocuCenter Admin',
  description: 'Admin console for DocuCenter Kiosk System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <Providers>
          <div className="flex h-screen overflow-hidden">
            <NavSidebar />
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
