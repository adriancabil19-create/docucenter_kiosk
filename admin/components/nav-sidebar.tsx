'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getFleetSummary } from '@/lib/api';
import type { FleetSummary } from '@/lib/types';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/kiosks', label: 'Kiosks', icon: '🖥️' },
  { href: '/alerts', label: 'Alerts', icon: '🚨' },
  { href: '/analytics', label: 'Analytics', icon: '📈' },
  { href: '/transactions', label: 'Transactions', icon: '💳' },
  { href: '/payments', label: 'Payments', icon: '💰' },
  { href: '/print-jobs', label: 'Print Jobs', icon: '🖨️' },
  { href: '/paper', label: 'Paper Trays', icon: '📄' },
  { href: '/storage', label: 'Storage', icon: '🗄️' },
  { href: '/logs', label: 'Activity Logs', icon: '📋' },
  { href: '/kiosk', label: 'Kiosk Status', icon: '🩺' },
  { href: '/legal', label: 'Legal & Privacy', icon: '📜' },
];

export function NavSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [summary, setSummary] = useState<FleetSummary | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getFleetSummary()
        .then((r) => alive && setSummary(r.summary))
        .catch(() => {});
    load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const badgeFor = (href: string): number | null => {
    if (href === '/alerts' && summary && summary.openIncidents > 0) return summary.openIncidents;
    if (href === '/kiosks' && summary && summary.kiosks.offline > 0) return summary.kiosks.offline;
    return null;
  };

  return (
    <aside className="glass-nav flex h-full w-56 flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 border-b border-white/40 px-4 py-5">
        <span className="text-2xl" aria-hidden="true">
          🖨️
        </span>
        <div>
          <p className="text-sm font-bold leading-tight text-slate-900">DocuCenter</p>
          <p className="text-xs text-slate-600">Admin Console</p>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Primary" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          const badge = badgeFor(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                active
                  ? 'bg-accent/15 text-accent-strong ring-1 ring-accent/20'
                  : 'text-slate-700 hover:bg-white/50 hover:text-slate-900'
              }`}
            >
              <span className="text-base" aria-hidden="true">
                {icon}
              </span>
              <span className="flex-1">{label}</span>
              {badge != null && (
                <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/40 px-4 py-3 space-y-2">
        <p className="text-xs text-slate-500">DocuCenter Kiosk v1.0</p>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
        >
          <span aria-hidden="true">🚪</span> Sign out
        </button>
      </div>
    </aside>
  );
}
