/**
 * Background sweep for stale "Ask for Assistance" requests (rules 30/31).
 *
 * Runs on every role, on a short interval (independent of the 6-hourly DB
 * prune in maintenance.service.ts — these thresholds are minutes, not days):
 *
 *  - Expiration (PENDING → EXPIRED after ASSISTANCE_EXPIRATION_TIME) is
 *    evaluated locally on whichever instance is asked, against its own copy
 *    of the row. Kiosk and cloud each hold the same requested_at and the same
 *    configured threshold, so both arrive at EXPIRED independently without
 *    needing a downlink command for it — simpler than round-tripping through
 *    the command queue for a purely time-based transition.
 *  - Escalation (unacknowledged PENDING → an admin-visible incident after
 *    ASSISTANCE_ESCALATION_TIME) only runs where isCloudRole is true, because
 *    it creates a row in *this instance's* `incidents` table and Admin only
 *    ever reads the cloud's incidents. Running it on the kiosk role too would
 *    raise a second, separately-synced incident for the same event.
 */

import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { escalateStaleAssistanceRequests, expireStaleAssistanceRequests, insertIncident, insertLog } from '../database';

let started = false;

const TICK_MS = 30_000;

const tick = async (): Promise<void> => {
  try {
    if (config.isCloudRole) {
      const escalated = await escalateStaleAssistanceRequests();
      for (const r of escalated) {
        await insertIncident({
          kiosk_id: r.kiosk_id,
          device: 'assistance',
          error_code: 'CUSTOMER_ASSISTANCE_UNHANDLED',
          severity: 'warning',
          message: `Kiosk ${r.kiosk_id}: assistance request unacknowledged for over ${Math.round(
            config.assistance.escalationSeconds / 60,
          )} minute(s)`,
          metadata: { requestId: r.id, requestedAt: r.requested_at },
        });
        await insertLog('warn', 'assistance', `Escalated unhandled assistance request on ${r.kiosk_id}`, {
          requestId: r.id,
          kioskId: r.kiosk_id,
        });
      }
    }

    const expired = await expireStaleAssistanceRequests();
    for (const r of expired) {
      await insertLog('info', 'assistance', `Assistance request on ${r.kiosk_id} expired unacknowledged`, {
        requestId: r.id,
        kioskId: r.kiosk_id,
      });
    }
  } catch (err) {
    logger.warn('Assistance scheduler tick failed', { error: String(err) });
  }
};

export const startAssistanceScheduler = (): void => {
  if (started) return;
  started = true;
  logger.info('Assistance scheduler started', {
    everySeconds: TICK_MS / 1000,
    escalationSeconds: config.assistance.escalationSeconds,
    expirationSeconds: config.assistance.expirationSeconds,
  });
  setInterval(() => void tick(), TICK_MS);
};
