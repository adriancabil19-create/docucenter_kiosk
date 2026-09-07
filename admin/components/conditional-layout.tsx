'use client';

import { usePathname } from 'next/navigation';
import { NavSidebar } from '@/components/nav-sidebar';

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The login screen brings its own full-screen layout.
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // The Legal page is public — render it without the authenticated nav chrome.
  if (pathname === '/legal') {
    return <main className="min-h-screen overflow-y-auto p-6">{children}</main>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <NavSidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
