'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/transactions', label: 'Transactions', icon: '💳' },
  { href: '/payments', label: 'Payments', icon: '💰' },
  { href: '/print-jobs', label: 'Print Jobs', icon: '🖨️' },
  { href: '/paper', label: 'Paper Trays', icon: '📄' },
  { href: '/storage', label: 'Storage', icon: '📁' },
  { href: '/logs', label: 'Activity Logs', icon: '📋' },
  { href: '/kiosk', label: 'Kiosk Status', icon: '🖥️' },
];

export function NavSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

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
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
      <div className="border-t border-gray-200 px-4 py-3 space-y-2">
        <p className="text-xs text-gray-400">DocuCenter Kiosk v1.0</p>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <span>🚪</span> Sign out
        </button>
      </div>
    </aside>
  );
}
