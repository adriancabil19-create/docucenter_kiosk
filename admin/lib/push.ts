'use client';

// Browser-side Web Push glue: registers the service worker (public/sw.js),
// requests Notification permission, subscribes via PushManager, and hands
// the subscription to our own /api/push/* routes (which attach the session's
// identity server-side — see those route handlers).

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

export type PushSupport = 'unsupported' | 'subscribed' | 'unsubscribed';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getPushStatus(): Promise<PushSupport> {
  if (!isSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration('/sw.js').catch(() => undefined);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  return sub ? 'subscribed' : 'unsubscribed';
}

export async function enablePush(): Promise<{ success: boolean; error?: string }> {
  if (!isSupported()) {
    return { success: false, error: 'Push notifications are not supported on this browser.' };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { success: false, error: 'Push notifications are not configured on this deployment yet.' };
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission was not granted.' };
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const json = sub.toJSON();
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!res.ok) return { success: false, error: 'Could not save the subscription.' };
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function disablePush(): Promise<void> {
  if (!isSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js').catch(() => undefined);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}
