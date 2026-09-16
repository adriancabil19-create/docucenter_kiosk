/**
 * Web Push — phone/browser OS-level notifications for the admin console.
 *
 * Only ever sends from the cloud-role instance: subscriptions are created by
 * a browser hitting the console, which only ever talks to the cloud backend
 * (or the single shared DB in single-process 'both' mode) — a pure 'kiosk'
 * role never has subscriptions to send to, so callers gate on
 * config.isCloudRole before calling in, matching the pattern already used
 * for assistance-request escalation.
 */

import webpush from 'web-push';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { listPushSubscriptions, deletePushSubscriptionById, type PushSubscriptionRow } from '../database';

let configured = false;

const ensureConfigured = (): boolean => {
  if (configured) return true;
  const { vapidPublicKey, vapidPrivateKey, vapidSubject } = config.push;
  if (!vapidPublicKey || !vapidPrivateKey) return false;
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  configured = true;
  return true;
};

export interface PushPayload {
  title: string;
  body: string;
  /** Relative path the browser opens when the notification is clicked. */
  url?: string;
}

const sendOne = async (sub: PushSubscriptionRow, payload: PushPayload): Promise<void> => {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
    );
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      // Subscription expired or the browser revoked it — stop trying it.
      await deletePushSubscriptionById(sub.id);
      return;
    }
    logger.warn('Push send failed', { id: sub.id, error: String(err) });
  }
};

/**
 * Fire-and-forget by design (never awaited by a request handler) — a push
 * provider hiccup must not slow down or fail the assistance/incident write
 * that triggered it.
 */
export const sendPushToAll = (payload: PushPayload, opts: { role?: 'ADMIN' | 'STAFF' } = {}): void => {
  if (!ensureConfigured()) return; // VAPID keys not set — push is simply off.
  void listPushSubscriptions(opts).then((subs) => {
    void Promise.all(subs.map((s) => sendOne(s, payload)));
  }).catch((err) => {
    logger.warn('Push: failed to list subscriptions', { error: String(err) });
  });
};
