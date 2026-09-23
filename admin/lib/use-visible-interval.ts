'use client';

import { useEffect, useRef } from 'react';

/**
 * Like `setInterval`, but skips ticks while the tab is hidden and fires an
 * immediate catch-up call when it becomes visible again.
 *
 * Several table components each hand-rolled a plain `setInterval` for their
 * 30s background refresh, none of them tab-visibility-aware — an admin with
 * this console open in a background tab (or several tabs, each polling its
 * own table of up to 500 rows) kept refetching on schedule for data nobody
 * was looking at. `lib/use-poll.ts` already solved this once internally;
 * this is that same primitive, extracted so both it and these table
 * components share one implementation.
 */
export function useVisibleInterval(callback: () => void, intervalMs: number) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') callbackRef.current();
    };
    const id = setInterval(tick, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') callbackRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
}
