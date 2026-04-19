'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/transactions', label: 'Transactions', icon: '💳' },
  { href: '/print-jobs', label: 'Print Jobs', icon: '🖨️' },
  { href: '/storage', label: 'Storage', icon: '📁' },
];

export function NavSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col border-r border-gray-200 bg-white shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-5">
        <span className="text-2xl">🖨️</span>
        <div>
          <p className="text-sm font-bold leading-tight text-gray-900">DocuCenter</p>
          <p className="text-xs text-gray-500">Admin Console</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 px-4 py-3">
        <p className="text-xs text-gray-400">DocuCenter Kiosk v1.0</p>
      </div>
    </aside>
  );
}
