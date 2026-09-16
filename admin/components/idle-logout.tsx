'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';

/** No activity in the console for this long → automatically signed out. */
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
/** How long before the timeout a "still there?" warning appears. */
const WARNING_BEFORE_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 1000;

// Deliberate interactions only — no 'mousemove'. A stray cursor drift over an
// unattended, logged-in console shouldn't count as "still here"; the warning
// should mean something. Any of these at any time (including while the
// warning is up) resets the clock and dismisses the warning.
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;

/**
 * App-wide inactivity auto-logout. Mounted alongside the nav (so it's only
 * active on authenticated pages, never /login or /legal). Ends the session
 * the same way the manual "Sign out" button does — POST /api/auth/logout,
 * then back to /login — so a console left open and unattended doesn't stay
 * signed in indefinitely.
 */
export function IdleLogout() {
  const router = useRouter();
  const lastActivity = useRef(Date.now());
  const loggingOut = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    const markActive = () => {
      lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActive, { passive: true }));

    const tick = setInterval(() => {
      if (loggingOut.current) return;
      const idleFor = Date.now() - lastActivity.current;

      if (idleFor >= IDLE_TIMEOUT_MS) {
        loggingOut.current = true;
        fetch('/api/auth/logout', { method: 'POST' })
          .catch(() => {})
          .finally(() => {
            router.push('/login');
            router.refresh();
          });
        return;
      }

      const remainingMs = IDLE_TIMEOUT_MS - idleFor;
      setSecondsLeft(remainingMs <= WARNING_BEFORE_MS ? Math.ceil(remainingMs / 1000) : null);
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive));
      clearInterval(tick);
    };
  }, [router]);

  const stayLoggedIn = () => {
    lastActivity.current = Date.now();
    setSecondsLeft(null);
  };

  return (
    <Modal isOpen={secondsLeft !== null} isDismissable={false} hideCloseButton isKeyboardDismissDisabled>
      <ModalContent>
        <ModalHeader>Still there?</ModalHeader>
        <ModalBody>
          <p className="text-sm text-slate-700">
            You&apos;ll be signed out in {secondsLeft ?? 0}s due to inactivity.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onPress={stayLoggedIn}>
            Stay signed in
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
