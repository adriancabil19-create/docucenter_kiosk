'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getFleetSummary } from '@/lib/api';
import type { FleetSummary } from '@/lib/types';
import { LogoMark } from '@/components/logo';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/kiosks', label: 'Kiosks', icon: '🖥️' },
  { href: '/alerts', label: 'Alerts', icon: '🚨' },
  { href: '/analytics', label: 'Analytics', icon: '📈' },
  { href: '/transactions', label: 'Transactions', icon: '💳' },
  { href: '/payments', label: 'Payments', icon: '💰' },
  { href: '/print-jobs', label: 'Print Jobs', icon: '🖨️' },
  { href: '/paper', label: 'Paper Trays', icon: '📄' },
  { href: '/pricing', label: 'Pricing', icon: '🏷️' },
  { href: '/storage', label: 'Storage', icon: '🗄️' },
  { href: '/staff', label: 'Staff Management', icon: '🧑‍💼' },
  { href: '/logs', label: 'Activity Logs', icon: '📋' },
  { href: '/kiosk', label: 'Kiosk Status', icon: '🩺' },
  { href: '/legal', label: 'Legal & Privacy', icon: '📜' },
];

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {open ? (
        <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <>
          <path d="M3 6H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M3 10H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M3 14H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function NavSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [summary, setSummary] = useState<FleetSummary | null>(null);
  // Off-canvas drawer state — only matters below the `lg` breakpoint; on
  // larger screens the sidebar is always shown via CSS regardless of this.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getFleetSummary()
        .then((r) => alive && setSummary(r.summary))
        .catch(() => {});
    load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Close the drawer whenever the route changes (link tap, back button, etc.).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const badgeFor = (href: string): number | null => {
    if (href === '/alerts' && summary && summary.openIncidents > 0) return summary.openIncidents;
    if (href === '/kiosks' && summary && summary.kiosks.offline > 0) return summary.kiosks.offline;
    if (href === '/staff' && summary && summary.pendingStaffPinRequests > 0) return summary.pendingStaffPinRequests;
    return null;
  };

  return (
    <>
      {/* Mobile-only toggle, fixed so it stays reachable regardless of scroll
          or drawer state. Hidden at `lg` and above, where the sidebar is
          always visible inline. */}
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={mobileOpen}
        className="glass fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full text-slate-700 shadow-lg lg:hidden"
      >
        <HamburgerIcon open={mobileOpen} />
      </button>

      {/* Backdrop, mobile only, closes the drawer on tap. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`glass-nav fixed inset-y-0 left-0 z-40 flex h-full w-64 max-w-[85vw] flex-col transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-56 lg:max-w-none lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 border-b border-white/40 px-4 py-5 pl-14 lg:pl-4">
          <LogoMark size={28} />
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
    </>
  );
}
