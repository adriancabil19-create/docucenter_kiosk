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

// Bumped to -v2: a single ✕ (or one accepted install) wrote the old key and
// then hid this card for a fortnight with no way to bring it back, so every
// browser used to test the install flow had silently opted itself out. The
// new key voids those stale dismissals once.
const DISMISS_KEY = 'docucenter_install_prompt_dismissed_at_v2';
const DISMISS_FOR_DAYS = 14;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !('MSStream' in window);
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
 * "Add to Home Screen" helper, shown on the login page (rule: easiest to
 * reach before signing in). Two very different platform stories:
 *  - Android/Chrome exposes a real `beforeinstallprompt` event this component
 *    captures and re-triggers from an "Install" button.
 *  - iOS Safari has no such API at all (Apple restriction) — the only path
 *    is the user's own Share -> Add to Home Screen, so this just shows those
 *    steps. iOS also requires the install (not just a browser tab) before
 *    Web Push can work at all, so this doubles as the on-ramp for that.
 */
export function InstallPrompt() {
  const [platform, setPlatform] = useState<'android' | 'ios' | 'waiting' | null>(null);
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    void registerServiceWorker();

    if (isIOS()) {
      setPlatform('ios');
      return;
    }

    // Already captured by the beforeInteractive script before this component
    // even mounted — the common case, since the event tends to fire early.
    if (window.__deferredInstallPrompt) {
      setDeferredEvent(window.__deferredInstallPrompt);
      setPlatform('android');
      return;
    }

    // Otherwise keep listening — Chrome can also delay firing it until its
    // own engagement heuristic (roughly 30s of interaction) is satisfied,
    // which can happen well after this component has already mounted.
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      window.__deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setDeferredEvent(e as BeforeInstallPromptEvent);
      setPlatform('android');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    // Chrome stays completely silent when it has decided the app is not
    // installable — most often because it is ALREADY installed, which it
    // treats as "nothing to offer" rather than an error. Rendering nothing
    // in that case makes "already installed", "not installable" and "this
    // component is broken" look identical from the outside, which is what
    // made this so hard to pin down. Surface it instead of vanishing.
    const t = setTimeout(() => setPlatform((p) => p ?? 'waiting'), 3000);

    return () => {
      clearTimeout(t);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    };
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

  if (!platform || dismissed) return null;

  return (
    <div className="glass mt-4 w-full max-w-sm p-4 text-sm text-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">Add DocuCenter to your Home Screen</p>
          {platform === 'android' && (
            <p className="mt-1 text-slate-600">
              Quick access from your home screen, plus phone notifications for new assistance requests and
              alerts.
            </p>
          )}
          {platform === 'ios' && (
            <p className="mt-1 text-slate-600">
              Tap the <strong>Share</strong> icon in Safari&apos;s toolbar (the square with an arrow
              pointing up), then <strong>&ldquo;Add to Home Screen.&rdquo;</strong> This is required on
              iPhone for phone notifications to work.
            </p>
          )}
          {platform === 'waiting' && (
            <p className="mt-1 text-slate-600">
              No Install button? Your browser still thinks DocuCenter is installed — it only offers
              installation when it is not. If you already removed it, open this site&apos;s settings
              (tap the icon left of the address bar) and choose{' '}
              <strong>Clear &amp; reset</strong>, then reload this page.
            </p>
          )}
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
      {platform === 'android' && (
        <button
          type="button"
          onClick={install}
          disabled={installing}
          className="mt-3 w-full rounded-lg bg-accent py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {installing ? 'Installing…' : 'Install'}
        </button>
      )}
    </div>
  );
}
