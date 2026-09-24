'use client';

import { useCallback, useEffect, useState } from 'react';
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
const DISMISS_FOR_DAYS = 7;

/**
 * How the app can be installed on THIS browser:
 * - `prompt`  Chrome handed us a real beforeinstallprompt event to re-trigger.
 * - `ios`     WebKit — no install API exists at all, only manual Share ->
 *             Add to Home Screen. Apple provides no way to automate this.
 * - `manual`  Installable browser that has not (yet) fired the event, so the
 *             browser's own menu is the only route.
 * - `none`    Already installed, or nothing to offer.
 */
type InstallMode = 'prompt' | 'ios' | 'manual' | 'none';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as desktop Safari ("MacIntel"), so the touch
  // point count is the only reliable way to tell an iPad from a real Mac.
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(ua) || iPadOS;
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
 * Works out how (and whether) this browser can install the app.
 *
 * Deliberately never resolves to `none` just because Chrome has not fired
 * `beforeinstallprompt`: that event is gated behind an engagement heuristic
 * that can take ~30s of interaction, and waiting on it was why the card
 * usually never appeared at all. Falling back to `manual` means there is
 * always something actionable on screen.
 */
function useInstallMode(): { mode: InstallMode; promptInstall: () => Promise<void> } {
  const [mode, setMode] = useState<InstallMode>('none');
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return; // Already installed — nothing to offer.

    void registerServiceWorker();

    if (isIOS()) {
      setMode('ios');
      return;
    }

    // Already captured by the beforeInteractive script before this component
    // even mounted — the common case, since the event tends to fire early.
    if (window.__deferredInstallPrompt) {
      setDeferredEvent(window.__deferredInstallPrompt);
      setMode('prompt');
    } else {
      setMode('manual');
    }

    // Chrome can delay firing until its engagement heuristic is satisfied,
    // well after mount — upgrade `manual` to a real prompt if that happens.
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      window.__deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setDeferredEvent(e as BeforeInstallPromptEvent);
      setMode('prompt');
    };
    const onInstalled = () => setMode('none');

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredEvent) return;
    try {
      await deferredEvent.prompt();
      const choice = await deferredEvent.userChoice;
      if (choice.outcome === 'accepted') setMode('none');
    } finally {
      window.__deferredInstallPrompt = undefined;
      setDeferredEvent(null);
    }
  }, [deferredEvent]);

  return { mode, promptInstall };
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="inline-block h-4 w-4 align-text-bottom"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

/** The platform-specific body shared by the login card and the sidebar panel. */
function InstallInstructions({
  mode,
  onInstall,
  installing,
}: {
  mode: InstallMode;
  onInstall: () => void;
  installing: boolean;
}) {
  if (mode === 'ios') {
    return (
      <ol className="mt-3 space-y-1.5 text-slate-600">
        <li>
          1. Tap the Share button <ShareIcon /> in Safari&apos;s toolbar.
        </li>
        <li>2. Scroll down and choose &ldquo;Add to Home Screen&rdquo;.</li>
        <li>3. Tap &ldquo;Add&rdquo; to confirm.</li>
      </ol>
    );
  }

  if (mode === 'manual') {
    return (
      <ol className="mt-3 space-y-1.5 text-slate-600">
        <li>1. Open your browser menu (⋮).</li>
        <li>
          2. Choose &ldquo;Install app&rdquo; or &ldquo;Add to Home screen&rdquo;.
        </li>
        <li>3. Confirm to add it.</li>
      </ol>
    );
  }

  return (
    <button
      type="button"
      onClick={onInstall}
      disabled={installing}
      className="mt-3 w-full rounded-lg bg-accent py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {installing ? 'Installing…' : 'Install'}
    </button>
  );
}

/**
 * "Add to Home Screen" helper shown on the login page.
 *
 * Android/Chrome gets a real one-tap Install button when Chrome has handed us
 * a `beforeinstallprompt` event. iOS gets step-by-step Share -> Add to Home
 * Screen instructions, because WebKit exposes no install API whatsoever —
 * manual steps are the only thing that can work there.
 */
export function InstallPrompt() {
  const { mode, promptInstall } = useInstallMode();
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [suppressed, setSuppressed] = useState(true);

  // Read localStorage after mount only — doing it during render would not
  // match the server-rendered HTML and would cause a hydration mismatch.
  useEffect(() => {
    setSuppressed(wasRecentlyDismissed());
  }, []);

  const dismiss = () => {
    rememberDismissed();
    setDismissed(true);
  };

  const install = async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  };

  if (mode === 'none' || dismissed || suppressed) return null;

  return (
    <div className="glass mt-4 w-full max-w-sm p-4 text-sm text-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">Add DocuCenter to your Home Screen</p>
          <p className="mt-1 text-slate-600">
            Quick access from your home screen, plus phone notifications for new assistance requests
            and alerts.
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
      <InstallInstructions mode={mode} onInstall={install} installing={installing} />
    </div>
  );
}

/**
 * Always-available install entry point for the sidebar footer.
 *
 * The login card is easy to miss — it only exists on /login, and once
 * dismissed it stays hidden for days. An admin who is already signed in would
 * otherwise have no way to reach the install flow at all, which is the usual
 * reason "the install popup never appears".
 */
export function InstallButton() {
  const { mode, promptInstall } = useInstallMode();
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  const install = async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  };

  if (mode === 'none') return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-accent/10 hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <span aria-hidden="true">📲</span> Install app
      </button>
      {open && (
        <div className="mt-1 rounded-lg bg-white/60 p-2.5 text-xs text-slate-700">
          <InstallInstructions mode={mode} onInstall={install} installing={installing} />
        </div>
      )}
    </div>
  );
}
