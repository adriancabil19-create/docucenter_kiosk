'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PollState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Fetch once, now. */
  refresh: () => Promise<void>;
  /** Timestamp (locale string) of the last successful fetch. */
  updatedAt: string | null;
}

/**
 * Poll `fetcher` every `intervalMs`. Gives the admin views a live feel without
 * a WebSocket. Pauses while the tab is hidden and refetches on focus.
 */
export function usePoll<T>(
  fetcher: () => Promise<T>,
  intervalMs = 10000,
  initial: T | null = null,
): PollState<T> {
  const [data, setData] = useState<T | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetcherRef.current();
      setData(next);
      setError(null);
      setUpdatedAt(new Date().toLocaleTimeString('en-PH'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') void refresh();
      }, intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    void refresh();
    start();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, intervalMs]);

  return { data, error, loading, refresh, updatedAt };
}
