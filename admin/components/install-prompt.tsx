'use client';

import { useEffect, useState } from 'react';
import { registerServiceWorker } from '@/lib/push';

// Chrome-only event, not in the standard DOM lib typings.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    // Stashed by the beforeInteractive inline script in app/layout.tsx, in
    // case the event fires before this component's own listener attaches.
    __deferredInstallPrompt?: BeforeInstallPromptEvent;
  }
}

const DISMISS_KEY = 'docucenter_install_prompt_dismissed_at';
const DISMISS_FOR_DAYS = 14;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

function wasRecentlyDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return false;
    return Date.now() - dismissedAt < DISMISS_FOR_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false; // Private browsing / storage blocked — just show it.
  }
}

function rememberDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // No persistence available — it'll just show again next visit. Fine.
  }
}

/**
 * "Add to Home Screen" helper, shown on the login page. Android/Chrome only —
 * it exposes a real `beforeinstallprompt` event this component captures and
 * re-triggers from an "Install" button. iOS Safari has no equivalent API
 * (Apple restriction, the only path there is the user's own manual Share ->
 * Add to Home Screen), so there's nothing reliable to prompt there and this
 * intentionally stays silent on iOS rather than showing static instructions.
 */
export function InstallPrompt() {
  const [available, setAvailable] = useState(false);
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    void registerServiceWorker();

    // Already captured by the beforeInteractive script before this component
    // even mounted — the common case, since the event tends to fire early.
    if (window.__deferredInstallPrompt) {
      setDeferredEvent(window.__deferredInstallPrompt);
      setAvailable(true);
      return;
    }

    // Otherwise keep listening — Chrome can also delay firing it until its
    // own engagement heuristic (roughly 30s of interaction) is satisfied,
    // which can happen well after this component has already mounted.
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      window.__deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setDeferredEvent(e as BeforeInstallPromptEvent);
      setAvailable(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  const dismiss = () => {
    rememberDismissed();
    setDismissed(true);
  };

  const install = async () => {
    if (!deferredEvent) return;
    setInstalling(true);
    try {
      await deferredEvent.prompt();
      const choice = await deferredEvent.userChoice;
      if (choice.outcome === 'accepted') rememberDismissed();
    } finally {
      window.__deferredInstallPrompt = undefined;
      setDeferredEvent(null);
      setInstalling(false);
    }
  };

  if (!available || dismissed) return null;

  return (
    <div className="glass mt-4 w-full max-w-sm p-4 text-sm text-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">Add DocuCenter to your Home Screen</p>
          <p className="mt-1 text-slate-600">
            Quick access from your home screen, plus phone notifications for new assistance requests and
            alerts.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          ✕
        </button>
      </div>
      <button
        type="button"
        onClick={install}
        disabled={installing}
        className="mt-3 w-full rounded-lg bg-accent py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {installing ? 'Installing…' : 'Install'}
      </button>
    </div>
  );
}
