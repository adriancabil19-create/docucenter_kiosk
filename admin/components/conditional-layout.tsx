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
      {/* Extra top padding clears the fixed hamburger toggle everywhere it's
          visible (below `lg`) — kept separate from the sm: padding shorthand
          so it isn't overridden between the sm and lg breakpoints.
          `min-w-0` is required: a flex item's default min-width is its
          content's min-content size, so a wide table anywhere inside (even
          one already wrapped in its own overflow-x-auto) would otherwise
          force this whole column — and the page — wider than the viewport
          instead of scrolling inside its own box. */}
      <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-4 pt-16 sm:px-6 sm:pb-6 lg:pt-6">
        {children}
      </main>
    </div>
  );
}
